import * as THREE from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';

import { OUTLINE } from './constants';

export interface Outline {
  /**
   * Must be called with the drawing buffer's size whenever it changes.
   * `LineMaterial` expands its quads in clip space using this, so a stale
   * resolution renders the lines at the wrong width or not at all.
   */
  setResolution(width: number, height: number): void;
  dispose(): void;
}

/**
 * Per-mesh outline controls, read from `mesh.userData`.
 *
 * `outlineThreshold` is the crease angle above which an edge is drawn, and it
 * is the single most consequential number in this file. The bounds are
 * arithmetic, not taste:
 *
 *  - The plan is sampled at ~2.3cm, so adjacent facets around the bowed end cap
 *    differ by about 4.4 degrees. Below that, every facet becomes a line and the
 *    desk turns into a wireframe.
 *  - The desktop's moulding is three bevel segments over a quarter turn, so 30
 *    degrees a facet. Above that, the moulding stops being drawn at all.
 *
 * 22 sits comfortably between the two. Parts with nothing but hard corners can
 * afford far more, and say so individually.
 */
export interface OutlineUserData {
  outline?: false;
  outlineThreshold?: number;
}

/**
 * Draws the desk the way the reference photograph is drawn: a pale contour on
 * every silhouette and crease.
 *
 * The outlines are attached as children of the meshes they trace, so they
 * inherit their transforms. That matters for the hero drawer, whose outline has
 * to travel with it as it opens without anything having to keep the two in sync.
 *
 * Each edge is drawn twice from one shared geometry — a wide, dim, additive halo
 * and a narrow opaque core — which gives the reference's soft glow without a
 * bloom pass or a single render target.
 *
 * `LineSegments2` rather than `LineSegments`, because `LineBasicMaterial`'s
 * `linewidth` is ignored on effectively every platform: a one-pixel GL line on a
 * DPR-2 display is a half-CSS-pixel hairline, visibly thinner and dimmer than
 * the reference's contour, and that difference is most of whether this reads as
 * the same drawing or not.
 */
export function buildOutline(root: THREE.Object3D): Outline {
  const halo = new LineMaterial({
    color: new THREE.Color(OUTLINE.colour),
    linewidth: OUTLINE.haloWidth,
    // World units would swell the lines as the camera dollies from three metres
    // out to forty centimetres. These are CSS pixels, and stay put.
    worldUnits: false,
    transparent: true,
    opacity: OUTLINE.haloOpacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const core = new LineMaterial({
    color: new THREE.Color(OUTLINE.colour),
    linewidth: OUTLINE.coreWidth,
    worldUnits: false,
    transparent: true,
    opacity: OUTLINE.coreOpacity,
    toneMapped: false,
  });

  const geometries: LineSegmentsGeometry[] = [];
  const added: LineSegments2[] = [];

  // Collect first, add second. `LineSegments2` extends `Mesh`, so attaching the
  // outlines inside the traversal would have `traverse` walk straight into the
  // lines it had just added and try to outline those in turn, forever.
  const targets: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object instanceof LineSegments2) return;
    if ((object.userData as OutlineUserData).outline === false) return;
    targets.push(object);
  });

  for (const object of targets) {
    const data = object.userData as OutlineUserData;

    const edges = new THREE.EdgesGeometry(
      object.geometry,
      data.outlineThreshold ?? OUTLINE.thresholdAngle,
    );
    // Nothing crossed the threshold, so there is no contour to draw.
    if (edges.attributes.position.count === 0) {
      edges.dispose();
      continue;
    }

    const geometry = new LineSegmentsGeometry().fromEdgesGeometry(edges);
    edges.dispose();
    geometries.push(geometry);

    for (const [material, order] of [
      [halo, 1],
      [core, 2],
    ] as const) {
      const line = new LineSegments2(geometry, material);
      line.renderOrder = order;
      // The parent mesh already carries the transform; the line is drawn from
      // the same local geometry, so it must not be culled on its own bounds.
      line.frustumCulled = false;
      object.add(line);
      added.push(line);
    }
  }

  return {
    setResolution(width, height) {
      halo.resolution.set(width, height);
      core.resolution.set(width, height);
    },
    dispose() {
      for (const line of added) line.removeFromParent();
      for (const geometry of geometries) geometry.dispose();
      halo.dispose();
      core.dispose();
    },
  };
}
