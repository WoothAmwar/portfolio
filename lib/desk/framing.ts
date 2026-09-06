import * as THREE from 'three';

import { CAMERA, OPENING_Y_PADDING, TIMING, drawerTravelAt } from './constants';
import { MonotoneCubic } from './monotoneCubic';
import type { DeskBuild } from './buildDesk';

/**
 * The camera's orbit around the open drawer, interpolated in angle space.
 *
 * Interpolating positions instead would distort the rotation: between two
 * waypoints a straight-ish line through space sweeps most of its angle near the
 * end, which is what makes a camera appear to lurch as it comes overhead. Here
 * the azimuth, elevation and height are each carried by a monotone cubic, so
 * evenly spaced angles turn the view at an even rate, and none of the three can
 * double back.
 */
export class OrbitPath {
  private readonly centre: THREE.Vector3;
  private readonly azimuth: MonotoneCubic;
  private readonly elevation: MonotoneCubic;
  private readonly height: MonotoneCubic;
  private readonly holdUntil: number;
  private readonly heldOffsetX: number;

  constructor(
    centre: THREE.Vector3,
    times: number[],
    azimuths: number[],
    elevations: number[],
    heights: number[],
    holdUntil: number,
    heldOffsetX: number,
  ) {
    this.centre = centre;
    this.azimuth = new MonotoneCubic(times, azimuths);
    this.elevation = new MonotoneCubic(times, elevations);
    this.height = new MonotoneCubic(times, heights);
    this.holdUntil = holdUntil;
    this.heldOffsetX = heldOffsetX;
  }

  at(t: number, out: THREE.Vector3): THREE.Vector3 {
    const elevation = this.elevation.at(t);
    const y = this.height.at(t);
    // The height and the elevation fix the distance, so the camera stays on the
    // drawer's orbit without the distance needing to be authored separately.
    const horizontal = (y - this.centre.y) / Math.tan(elevation);

    // Through the approach the camera holds its lane exactly: the azimuth is
    // whatever keeps x where it started. Interpolating an azimuth here instead
    // would ripple by a fraction of a millimetre, which is enough to make the
    // camera technically drift right before it drifts left.
    const sin =
      t <= this.holdUntil
        ? Math.min(Math.max(this.heldOffsetX / horizontal, -1), 1)
        : Math.sin(this.azimuth.at(t));
    const cos = Math.sqrt(Math.max(1 - sin * sin, 0));

    return out.set(
      this.centre.x + horizontal * sin,
      y,
      this.centre.z + horizontal * cos,
    );
  }
}

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Poses {
  startTarget: THREE.Vector3;
  endTarget: THREE.Vector3;
  start: THREE.Vector3;
  end: THREE.Vector3;
  /** camera position over normalised time, monotone in every axis */
  cameraPath: OrbitPath;
  /** how far the aim has travelled from the desk to the drawer, over time */
  aimPath: MonotoneCubic;
}

/**
 * Centre of the hero drawer's opening at a given point on the timeline. The aim
 * follows the drawer as it slides out rather than its final resting place, so
 * once the aim is locked the drawer is exactly centred and never has to be
 * caught up with.
 */
export function drawerCentreAt(
  build: DeskBuild,
  time: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const box = build.heroDrawerBox;
  return out.set(
    (box.min.x + box.max.x) / 2,
    box.max.y,
    (box.min.z + box.max.z) / 2 + drawerTravelAt(time, build.heroTravel),
  );
}

/**
 * The camera's up vector once it is directly over the drawer. Looking straight
 * down, this puts world -Z to the right of screen, so the drawer's front (+Z)
 * lands on the left. It is also the roll-free limit for a camera descending
 * from the drawer's +X side, which is the side this path approaches from, so
 * arriving in this orientation costs no rotation at all.
 */
export const OVERHEAD_UP = new THREE.Vector3(-1, 0, 0);

const corner = new THREE.Vector3();

function boxCorners(box: THREE.Box3): THREE.Vector3[] {
  const { min, max } = box;
  const out: THREE.Vector3[] = [];
  for (const x of [min.x, max.x]) {
    for (const y of [min.y, max.y]) {
      for (const z of [min.z, max.z]) out.push(new THREE.Vector3(x, y, z));
    }
  }
  return out;
}

/**
 * An up vector that is never parallel to the view direction, matching the one
 * the animation blends to when looking straight down.
 */
function upFor(dir: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  return Math.abs(dir.y) > 0.999 ? out.set(0, 0, -1) : out.set(0, 1, 0);
}

/**
 * Distance along `dir` at which `box` projects to at most `wFrac` x `hFrac` of
 * the viewport. Iterates because a perspective projection only scales with 1/d
 * approximately. Taking the larger of the two required distances means the box
 * always fits inside the budget, touching whichever limit binds first.
 */
export function solveFramingDistance(
  camera: THREE.PerspectiveCamera,
  box: THREE.Box3,
  dir: THREE.Vector3,
  target: THREE.Vector3,
  wFrac: number,
  hFrac: number,
  forcedUp?: THREE.Vector3,
  iterations = 5,
): number {
  const corners = boxCorners(box);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const savedPosition = camera.position.clone();
  const savedQuaternion = camera.quaternion.clone();
  const savedUp = camera.up.clone();
  const up = new THREE.Vector3();

  let distance = sphere.radius / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

  for (let i = 0; i < iterations; i++) {
    camera.position.copy(target).addScaledVector(dir, distance);
    camera.up.copy(forcedUp ?? upFor(dir, up));
    camera.lookAt(target);
    camera.updateMatrixWorld(true);

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const point of corners) {
      corner.copy(point).project(camera);
      minX = Math.min(minX, corner.x);
      maxX = Math.max(maxX, corner.x);
      minY = Math.min(minY, corner.y);
      maxY = Math.max(maxY, corner.y);
    }

    // NDC spans -1..1, so a full viewport is 2 units across.
    distance *= Math.max((maxX - minX) / (2 * wFrac), (maxY - minY) / (2 * hFrac));
  }

  camera.position.copy(savedPosition);
  camera.quaternion.copy(savedQuaternion);
  camera.up.copy(savedUp);
  camera.updateMatrixWorld(true);

  return distance;
}

export interface FrameBudget {
  landscape: { w: number; h: number };
  portrait: { w: number; h: number };
}

export const frameFor = (budget: FrameBudget, aspect: number) =>
  aspect >= 1 ? budget.landscape : budget.portrait;

/** The camera waypoints and look targets the timeline interpolates. */
export function computePoses(camera: THREE.PerspectiveCamera, build: DeskBuild): Poses {
  // The closing pose is solved first, because the opening pose has to be far
  // enough back to descend to it.
  const open = build.heroDrawerOpenBox;
  const endTarget = new THREE.Vector3(
    (open.min.x + open.max.x) / 2,
    open.max.y,
    (open.min.z + open.max.z) / 2,
  );
  const endDir = new THREE.Vector3(0, 1, 0);
  const endFrame = frameFor(CAMERA.endFrame, camera.aspect);
  const endDistance = solveFramingDistance(
    camera,
    open,
    endDir,
    endTarget,
    endFrame.w,
    endFrame.h,
    OVERHEAD_UP,
  );
  const end = endTarget.clone().addScaledVector(endDir, endDistance);

  const startTarget = new THREE.Vector3(...CAMERA.startTarget);
  const startDir = new THREE.Vector3(...CAMERA.startDir).normalize();
  const startFrame = frameFor(CAMERA.startFrame, camera.aspect);

  /** Distance that frames the desk to its budget from a given aim. */
  const distanceFor = (target: THREE.Vector3) =>
    solveFramingDistance(camera, build.deskBox, startDir, target, startFrame.w, startFrame.h);

  // `OPENING_Y_PADDING` is authored in viewport heights, so it has to be turned
  // into world units — and how many metres a screen height is worth depends on
  // how far back the camera ends up. Frame once to learn the distance, convert,
  // raise the aim, then frame again from the aim we actually mean to use, so the
  // desk keeps its budgeted size rather than shrinking as it moves down.
  if (OPENING_Y_PADDING !== 0) {
    const halfHeight =
      distanceFor(startTarget) * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    // Raising what the camera looks at pushes the subject down the frame.
    startTarget.y += OPENING_Y_PADDING * halfHeight * 2;
  }
  // On a tall, narrow viewport the closing shot can want to sit higher than a
  // comfortably framed desk does, which would have the camera climbing rather
  // than descending. Backing the opening pose off far enough to clear the
  // closing height keeps the move going one way; the desk simply reads smaller
  // than its budget on those viewports, which is the right trade.
  const startDistance = Math.max(
    distanceFor(startTarget),
    (end.y + CAMERA.minimumDescent - startTarget.y) / startDir.y,
  );
  const start = startTarget.clone().addScaledVector(startDir, startDistance);

  // The opening pose fixes the first knot; the rest are authored angles.
  const openingU = start.x - endTarget.x;
  const openingV = start.z - endTarget.z;
  const openingHorizontal = Math.hypot(openingU, openingV);
  const knots = [
    {
      at: 0,
      azimuth: Math.atan2(openingU, openingV),
      elevation: Math.atan2(start.y - endTarget.y, openingHorizontal),
      y: start.y,
    },
    ...CAMERA.path.map((step) => {
      const elevation = THREE.MathUtils.degToRad(step.elevationDeg);
      const y = THREE.MathUtils.lerp(start.y, end.y, step.y);
      // The approach knot's azimuth is not authored: it is whatever holds the
      // camera in its starting lane, so the join with the swing is seamless.
      const azimuth =
        step.azimuthDeg === null
          ? Math.asin(
              Math.min(
                Math.max(
                  (openingU * Math.tan(elevation)) / (y - endTarget.y),
                  -1,
                ),
                1,
              ),
            )
          : THREE.MathUtils.degToRad(step.azimuthDeg);
      return { at: step.at, azimuth, elevation, y };
    }),
  ];

  // Clamp the knots monotone. On the design viewport the authored angles
  // already are; on an unusual one this bends them slightly rather than letting
  // the camera drift back to the right.
  for (let i = 1; i < knots.length; i++) {
    knots[i].azimuth = Math.max(knots[i].azimuth, knots[i - 1].azimuth);
    knots[i].elevation = Math.max(knots[i].elevation, knots[i - 1].elevation);
    knots[i].y = Math.min(knots[i].y, knots[i - 1].y);
  }

  const times = knots.map((knot) => knot.at / TIMING.duration);
  const cameraPath = new OrbitPath(
    endTarget,
    times,
    knots.map((knot) => knot.azimuth),
    knots.map((knot) => knot.elevation),
    knots.map((knot) => knot.y),
    TIMING.approachEnd / TIMING.duration,
    openingU,
  );

  const aimPath = solveAimFractions(camera, build, cameraPath, startTarget);

  return {
    startTarget,
    endTarget,
    start,
    end,
    cameraPath,
    aimPath,
  };
}

/**
 * Solves how far the aim should have travelled from the desk to the drawer at
 * each of `CAMERA.aimTimes`, so that the drawer's centre walks steadily across
 * the frame to the middle instead of drifting outwards and being hauled back.
 *
 * Moving the aim towards the drawer always moves the drawer towards the centre
 * of frame, so a bisection converges; and because the targets step steadily
 * towards zero, the fractions come out increasing and the monotone cubic
 * through them keeps the drawer's travel across the screen in one direction.
 */
function solveAimFractions(
  camera: THREE.PerspectiveCamera,
  build: DeskBuild,
  cameraPath: OrbitPath,
  startTarget: THREE.Vector3,
): MonotoneCubic {
  const savedPosition = camera.position.clone();
  const savedQuaternion = camera.quaternion.clone();
  const savedUp = camera.up.clone();

  const position = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const aim = new THREE.Vector3();

  /** Where the drawer's centre lands across the frame, in NDC. */
  const screenX = (time: number, fraction: number): number => {
    cameraPath.at(time / TIMING.duration, position);
    drawerCentreAt(build, time, centre);
    aim.copy(startTarget).lerp(centre, fraction);
    camera.position.copy(position);
    camera.up.set(0, 1, 0);
    camera.lookAt(aim);
    camera.updateMatrixWorld(true);
    return corner.copy(centre).project(camera).x;
  };

  const opening = screenX(0, 0);
  const fractions = CAMERA.aimTimes.map((time) => {
    if (time >= CAMERA.aimLocked) return 1;
    const ramp = Math.min(time / CAMERA.aimLocked, 1);
    const wanted = opening * (1 - ramp);
    let low = 0;
    let high = 1;
    for (let i = 0; i < 28; i++) {
      const mid = (low + high) / 2;
      if (screenX(time, mid) < wanted) low = mid;
      else high = mid;
    }
    return (low + high) / 2;
  });

  camera.position.copy(savedPosition);
  camera.quaternion.copy(savedQuaternion);
  camera.up.copy(savedUp);
  camera.updateMatrixWorld(true);

  return new MonotoneCubic(
    CAMERA.aimTimes.map((time) => time / TIMING.duration),
    fractions,
  );
}

/** Screen-space rectangle of a box's eight corners, in CSS pixels. */
export function projectBoxRect(
  box: THREE.Box3,
  camera: THREE.PerspectiveCamera,
  viewportWidth: number,
  viewportHeight: number,
): ScreenRect {
  return rectFromPoints(boxCorners(box), camera, viewportWidth, viewportHeight);
}

/**
 * Screen-space rectangle of a box's top face, in CSS pixels. From the final
 * overhead camera this is an exact axis-aligned rectangle, which is what lets
 * the card sit precisely inside the drawer.
 */
export function projectTopFaceRect(
  box: THREE.Box3,
  camera: THREE.PerspectiveCamera,
  viewportWidth: number,
  viewportHeight: number,
): ScreenRect {
  const y = box.max.y;
  const points: THREE.Vector3[] = [];
  for (const x of [box.min.x, box.max.x]) {
    for (const z of [box.min.z, box.max.z]) points.push(new THREE.Vector3(x, y, z));
  }
  return rectFromPoints(points, camera, viewportWidth, viewportHeight);
}

function rectFromPoints(
  points: THREE.Vector3[],
  camera: THREE.PerspectiveCamera,
  viewportWidth: number,
  viewportHeight: number,
): ScreenRect {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    corner.copy(point).project(camera);
    const screenX = (corner.x * 0.5 + 0.5) * viewportWidth;
    const screenY = (-corner.y * 0.5 + 0.5) * viewportHeight;
    minX = Math.min(minX, screenX);
    maxX = Math.max(maxX, screenX);
    minY = Math.min(minY, screenY);
    maxY = Math.max(maxY, screenY);
  }

  return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
}
