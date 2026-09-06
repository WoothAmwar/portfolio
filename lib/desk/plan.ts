import * as THREE from 'three';

import { PEDESTAL_PEAK_U, PLAN } from './constants';

/**
 * The desk's plan outline, and every query cut from it.
 *
 * ## Coordinates
 *
 * The outline lives in world XZ: a `Vector2` here is `(worldX, worldZ)`, never
 * `(x, y)`. Seen from above with +x right and +z toward the viewer, the outline
 * winds **clockwise**: front edge left to right, round the right cap, back edge
 * right to left, round the left cap.
 *
 * ## Shape space
 *
 * `ExtrudeGeometry` extrudes along its shape's +Z, and `rotateX(-PI/2)` maps
 * `(sx, sy, sz) -> (sx, sz, -sy)`. So a shape authored in XY becomes a slab
 * standing in world XZ extruded up +Y — which is what we want — provided the
 * shape's Y is **the negation of world Z**:
 *
 *     shapeX =  worldX
 *     shapeY = -worldZ
 *
 * That is the house rule, and `shape()` and `frontRibbon()` are the only places
 * that apply it. Do not reach for `rotateX(+PI/2)` to make shape-Y read as the
 * desk's front: it extrudes to -Y, and flipping the winding to compensate
 * inverts the cap normals, which the bake pass depends on.
 *
 * ## Why the polyline is the source of truth
 *
 * The analytic profile below seeds a closed Catmull-Rom spline, and everything
 * downstream reads the spline's *samples*, never the profile. Smoothing moves
 * the curve by a millimetre or two; if the carcass sat on the spline while the
 * drawer fronts sat on the analytic function, the two would disagree by exactly
 * that much and z-fight along every seam.
 */
/**
 * The plan taken at one inset. Everything the desk is built from is a query on
 * one of these: the desktop reads inset 0, the carcass and drawer faces 0.035,
 * the plinth 0.055.
 */
export interface PlanSection {
  /** the outline at this inset, closed and clockwise in world XZ */
  outline: THREE.Vector2[];
  /** z of the front edge at a given x */
  frontZAt(x: number): number;
  /** z of the back edge at a given x */
  backZAt(x: number): number;
  /** front-to-back depth at a given x */
  depthAt(x: number): number;
  /** unit outward normal of the front edge at a given x, in world XZ */
  frontNormalAt(x: number): THREE.Vector2;
  /** the whole outline as an extrudable shape, in shape space */
  shape(): THREE.Shape;
  /**
   * The slice of the plan between two x planes, closed off with a straight cut
   * at each end. This is how a pedestal gets its footprint: the bowed outer cap
   * comes along for free, and the cut face is where the kneehole starts.
   */
  slab(x0: number, x1: number, samples?: number): THREE.Shape;
  /**
   * A band following the front edge from `x0` to `x1`, `thickness` deep. Every
   * drawer front and panel field is cut from one of these: extruded, it gives a
   * slab that curves with the bow, the way a real drawer front does.
   */
  ribbon(x0: number, x1: number, thickness: number, samples?: number): THREE.Shape;
  /**
   * A drawer front as a shaped solid: bowed face, flat back. This is how a real
   * bow-front drawer is made — a thick shaped front, thinning toward its ends,
   * with a straight drawer box behind it — and modelling it any other way puts
   * a straight box behind a curved face, where the curve falls away near the
   * ends and the box pokes out through it.
   *
   * `backZ` is the flat back plane, which is where the box in front of it must
   * stop, so it is returned rather than left for the caller to re-derive.
   */
  frontBlock(
    x0: number,
    x1: number,
    backThickness: number,
    samples?: number,
  ): { shape: THREE.Shape; backZ: number };
}

export interface DeskPlan {
  /** closed, clockwise, `(worldX, worldZ)`, no repeated final point */
  outline: THREE.Vector2[];
  halfWidth: number;
  /** the outline moved inward by `inset`; throws if that self-intersects */
  offset(inset: number): THREE.Vector2[];
  /** the plan at a given inset, built once per distinct inset */
  at(inset: number): PlanSection;
  /** the outline as an extrudable shape, in shape space */
  shape(inset?: number): THREE.Shape;
  /** z of the front edge at a given x, at inset 0 */
  frontZAt(x: number): number;
  /** z of the back edge at a given x, at inset 0 */
  backZAt(x: number): number;
  /** front-to-back depth at a given x, at inset 0 */
  depthAt(x: number): number;
  /** unit outward normal of the front edge at a given x, at inset 0 */
  frontNormalAt(x: number): THREE.Vector2;
  /** a band following the front edge at inset 0 */
  frontRibbon(x0: number, x1: number, thickness: number, samples?: number): THREE.Shape;
}

type PlanParams = typeof PLAN;

const gauss = (t: number) => Math.exp(-t * t);

/** Front edge before normalisation, in the profile's own -1..1 space. */
function rawFrontZ(u: number, p: PlanParams): number {
  const a = Math.abs(u);
  return (
    p.frontBase +
    p.bowPedestal * gauss((a - PEDESTAL_PEAK_U) / p.pedestalWidth) +
    p.bowCentre * gauss(a / p.centreWidth)
  );
}

/** Back edge before normalisation. The hollow is centred and shallow. */
function rawBackZ(u: number, p: PlanParams): number {
  return p.backBase + p.backHollow * gauss(Math.abs(u) / 0.5);
}

/**
 * Seeds for the spline: nine points across the front, five across the back, and
 * three inside each bowed cap. The cap endpoints are left out because they are
 * already the last front point and the first back point, and a repeated control
 * point is a zero-length segment that Catmull-Rom cannot take a tangent from.
 */
function controlPoints(p: PlanParams): THREE.Vector3[] {
  const halfWidth = p.width / 2;
  const xf = halfWidth - p.endRadius;
  const uf = xf / halfWidth;

  const capCentre = (rawFrontZ(uf, p) + rawBackZ(uf, p)) / 2;
  const capSemi = (rawFrontZ(uf, p) - rawBackZ(uf, p)) / 2;

  const points: THREE.Vector3[] = [];
  const push = (x: number, z: number) => points.push(new THREE.Vector3(x, 0, z));

  // Front, left to right.
  const frontCount = 9;
  for (let i = 0; i < frontCount; i += 1) {
    const x = THREE.MathUtils.lerp(-xf, xf, i / (frontCount - 1));
    push(x, rawFrontZ(x / halfWidth, p));
  }

  // Right cap: theta 0 is the front, PI is the back. Interior points only.
  for (const theta of [Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4]) {
    push(xf + p.endRadius * Math.sin(theta), capCentre + capSemi * Math.cos(theta));
  }

  // Back, right to left.
  const backCount = 5;
  for (let i = 0; i < backCount; i += 1) {
    const x = THREE.MathUtils.lerp(xf, -xf, i / (backCount - 1));
    push(x, rawBackZ(x / halfWidth, p));
  }

  // Left cap, back round to front.
  for (const theta of [(3 * Math.PI) / 4, Math.PI / 2, Math.PI / 4]) {
    push(-xf - p.endRadius * Math.sin(theta), capCentre + capSemi * Math.cos(theta));
  }

  return points;
}

/**
 * Scales the sampled outline so it measures exactly `width` x `depth`. The
 * lobes add to the front edge, so an un-normalised plan is always a little
 * deeper than `DESK.topDepth` claims — which would quietly make every clearance
 * derived from that constant a lie.
 */
function normalise(points: THREE.Vector2[], p: PlanParams): void {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.y);
    maxZ = Math.max(maxZ, point.y);
  }

  const scaleX = p.width / (maxX - minX);
  const scaleZ = p.depth / (maxZ - minZ);
  const midX = (minX + maxX) / 2;
  const midZ = (minZ + maxZ) / 2;

  for (const point of points) {
    point.x = (point.x - midX) * scaleX;
    point.y = (point.y - midZ) * scaleZ;
  }
}

/** Unit inward normal at `index`, for an outline wound clockwise in XZ. */
function inwardNormal(points: THREE.Vector2[], index: number, out: THREE.Vector2): THREE.Vector2 {
  const count = points.length;
  const previous = points[(index - 1 + count) % count];
  const next = points[(index + 1) % count];
  const tx = next.x - previous.x;
  const tz = next.y - previous.y;
  const length = Math.hypot(tx, tz) || 1;
  // Rotating the tangent by -90 degrees in (x, z) points into a clockwise loop.
  return out.set(tz / length, -tx / length);
}

/**
 * Offsetting a polyline inward self-intersects wherever the inset exceeds the
 * local radius of curvature. Our tightest curvature is the cap radius and our
 * insets are a fraction of it, so this should never fire — but `ExtrudeGeometry`
 * triangulates a self-intersecting contour into silent garbage rather than
 * throwing, so the cheap check is worth having.
 */
function assertSimple(original: THREE.Vector2[], moved: THREE.Vector2[], inset: number): void {
  const count = moved.length;
  for (let i = 0; i < count; i += 1) {
    const j = (i + 1) % count;
    const ax = original[j].x - original[i].x;
    const az = original[j].y - original[i].y;
    const bx = moved[j].x - moved[i].x;
    const bz = moved[j].y - moved[i].y;
    if (ax * bx + az * bz <= 0) {
      throw new Error(
        `desk plan: offsetting by ${inset} reversed the outline at sample ${i}; ` +
          'the inset exceeds the local radius of curvature',
      );
    }
  }
}

export function buildPlan(p: PlanParams = PLAN): DeskPlan {
  const curve = new THREE.CatmullRomCurve3(controlPoints(p), true, 'centripetal');
  // Centripetal is load-bearing, not a preference: uniform Catmull-Rom on a
  // closed loop with a cap this tight overshoots and crosses itself, and
  // centripetal provably cannot. It is the r185 default; do not override it.

  const sampled = curve.getSpacedPoints(p.samples);
  const outline = sampled.map((point) => new THREE.Vector2(point.x, point.z));
  // getSpacedPoints returns divisions + 1 points, and on a closed curve the
  // last one is the first one again.
  const last = outline[outline.length - 1];
  if (last.distanceTo(outline[0]) < 1e-9) outline.pop();

  normalise(outline, p);

  const halfWidth = p.width / 2;

  const toShape = (points: THREE.Vector2[]): THREE.Shape => {
    const shape = new THREE.Shape();
    shape.moveTo(points[0].x, -points[0].y);
    for (let i = 1; i < points.length; i += 1) shape.lineTo(points[i].x, -points[i].y);
    shape.closePath();
    return shape;
  };

  const offset = (inset: number): THREE.Vector2[] => {
    if (inset === 0) return outline.map((point) => point.clone());
    const normal = new THREE.Vector2();
    const moved = outline.map((point, index) => {
      inwardNormal(outline, index, normal);
      return new THREE.Vector2(point.x + normal.x * inset, point.y + normal.y * inset);
    });
    assertSimple(outline, moved, inset);
    return moved;
  };

  const buildSection = (points: THREE.Vector2[]): PlanSection => {
    const count = points.length;
    let minX = Infinity;
    let maxX = -Infinity;
    for (const point of points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
    }

    /** Every place the outline crosses a vertical line at `x`, front-most first. */
    const crossingsAt = (x: number): Array<{ z: number; index: number }> => {
      // Nudge off the extreme ends, where the outline is tangent to the line and
      // the crossing is numerically degenerate rather than absent.
      const target = THREE.MathUtils.clamp(x, minX + 1e-4, maxX - 1e-4);
      const found: Array<{ z: number; index: number }> = [];
      for (let i = 0; i < count; i += 1) {
        const a = points[i];
        const b = points[(i + 1) % count];
        if (a.x === b.x) continue;
        const t = (target - a.x) / (b.x - a.x);
        if (t < 0 || t >= 1) continue;
        found.push({ z: a.y + (b.y - a.y) * t, index: i });
      }
      if (found.length === 0) throw new Error(`desk plan: no outline at x=${x}`);
      return found.sort((one, other) => other.z - one.z);
    };

    const frontCrossing = (x: number) => crossingsAt(x)[0];
    const frontZAt = (x: number) => frontCrossing(x).z;
    const backZAt = (x: number) => {
      const found = crossingsAt(x);
      return found[found.length - 1].z;
    };
    const frontNormalAt = (x: number) =>
      inwardNormal(points, frontCrossing(x).index, new THREE.Vector2()).multiplyScalar(-1);

    return {
      outline: points,
      frontZAt,
      backZAt,
      depthAt: (x) => frontZAt(x) - backZAt(x),
      frontNormalAt,
      shape: () => toShape(points),
      slab(x0, x1, samples = 48) {
        // Sampled front-then-back rather than clipped from the polyline: the
        // region between two x planes is vertically simple everywhere on this
        // outline, so this is exact and cannot produce a stray winding.
        const lo = Math.min(x0, x1);
        const hi = Math.max(x0, x1);
        const ring: THREE.Vector2[] = [];
        for (let i = 0; i < samples; i += 1) {
          const x = THREE.MathUtils.lerp(lo, hi, i / (samples - 1));
          ring.push(new THREE.Vector2(x, frontZAt(x)));
        }
        for (let i = samples - 1; i >= 0; i -= 1) {
          const x = THREE.MathUtils.lerp(lo, hi, i / (samples - 1));
          ring.push(new THREE.Vector2(x, backZAt(x)));
        }
        return toShape(ring);
      },
      ribbon(x0, x1, thickness, samples = 24) {
        const outer: THREE.Vector2[] = [];
        const inner: THREE.Vector2[] = [];
        for (let i = 0; i < samples; i += 1) {
          const x = THREE.MathUtils.lerp(x0, x1, i / (samples - 1));
          const z = frontZAt(x);
          const normal = frontNormalAt(x);
          outer.push(new THREE.Vector2(x, z));
          inner.push(new THREE.Vector2(x - normal.x * thickness, z - normal.y * thickness));
        }
        inner.reverse();
        return toShape(outer.concat(inner));
      },
      frontBlock(x0, x1, backThickness, samples = 24) {
        const outer: THREE.Vector2[] = [];
        let lowest = Infinity;
        for (let i = 0; i < samples; i += 1) {
          const x = THREE.MathUtils.lerp(x0, x1, i / (samples - 1));
          const z = frontZAt(x);
          lowest = Math.min(lowest, z);
          outer.push(new THREE.Vector2(x, z));
        }
        const backZ = lowest - backThickness;
        outer.push(new THREE.Vector2(x1, backZ), new THREE.Vector2(x0, backZ));
        return { shape: toShape(outer), backZ };
      },
    };
  };

  const sections = new Map<number, PlanSection>();
  const at = (inset: number): PlanSection => {
    let section = sections.get(inset);
    if (!section) {
      section = buildSection(inset === 0 ? outline : offset(inset));
      sections.set(inset, section);
    }
    return section;
  };

  const base = at(0);

  return {
    outline,
    halfWidth,
    offset,
    at,
    shape: (inset = 0) => at(inset).shape(),
    frontZAt: base.frontZAt,
    backZAt: base.backZAt,
    depthAt: base.depthAt,
    frontNormalAt: base.frontNormalAt,
    frontRibbon: base.ribbon,
  };
}

let cached: DeskPlan | null = null;

/** The plan, built once. Every part of the desk is cut from this one outline. */
export function deskPlan(): DeskPlan {
  if (!cached) cached = buildPlan();
  return cached;
}
