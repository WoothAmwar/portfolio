import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';

import { REGISTRATION } from './constants';

export interface ScreenBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * The screen-space box the object actually covers, from its vertices.
 *
 * Deliberately not the projection of its bounding box: a box's corners project
 * outside the shape inside it — for this desk by about 6.6% in width — and
 * fitting the photograph to those would leave the photograph's desk larger than
 * the model that has to hide it, which is the one thing that must not happen.
 */
export function projectSilhouette(
  root: THREE.Object3D,
  camera: THREE.Camera,
  width: number,
  height: number,
): ScreenBox {
  const viewProjection = new THREE.Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );
  const vertex = new THREE.Vector3();
  const box: ScreenBox = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };

  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    // `LineSegments2` extends `Mesh`, but its `position` attribute is the quad
    // template each segment is expanded from — values out to y = 2 in local
    // space, not points on the desk. Measuring those inflates the silhouette to
    // roughly three times its true width.
    if (object instanceof LineSegments2) return;
    const position = object.geometry.attributes.position;
    if (!position) return;
    for (let i = 0; i < position.count; i += 1) {
      vertex
        .fromBufferAttribute(position, i)
        .applyMatrix4(object.matrixWorld)
        .applyMatrix4(viewProjection);
      const x = (vertex.x * 0.5 + 0.5) * width;
      const y = (-vertex.y * 0.5 + 0.5) * height;
      if (x < box.x0) box.x0 = x;
      if (x > box.x1) box.x1 = x;
      if (y < box.y0) box.y0 = y;
      if (y > box.y1) box.y1 = y;
    }
  });

  return box;
}

/** Where to draw the photograph, in 0..1 of the viewport with y running up. */
export interface PhotoRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Places the photograph so the desk inside it lands underneath the desk the
 * model draws, slightly smaller, so the model covers it completely and the
 * photograph's own desk is never visible.
 *
 * The photograph is scaled uniformly and never stretched — the room around the
 * desk has to stay believable — which works only because the model's desk was
 * proportioned to project at the same aspect as the photograph's, 1.98. The
 * scale that follows is well under 1, so the picture sits small in the frame
 * with black around it. That is intended: the photograph's own border is
 * already near-black, so the join does not read as an edge.
 */
export function photoRectFor(desk: ScreenBox, width: number, height: number): PhotoRect {
  const { deskLeft, deskRight, deskTop, deskBottom, coverMargin } = REGISTRATION;

  const deskWidthFraction = deskRight - deskLeft;
  const deskHeightFraction = deskBottom - deskTop;

  // Both candidates are expressed as the photograph's full width in screen
  // pixels, so they are comparable. Taking a width against a height here would
  // silently shrink the picture by the ratio between the two.
  const widthToFitAcross = (desk.x1 - desk.x0) / deskWidthFraction;
  const widthToFitDown =
    ((desk.y1 - desk.y0) / deskHeightFraction) * REGISTRATION.photoAspect;

  const photoWidth = Math.min(widthToFitAcross, widthToFitDown) * coverMargin;
  const photoHeight = photoWidth / REGISTRATION.photoAspect;

  // Line the photograph's desk up with the model's, centre on centre.
  const left = (desk.x0 + desk.x1) / 2 - (deskLeft + deskRight) / 2 * photoWidth;
  const top = (desk.y0 + desk.y1) / 2 - (deskTop + deskBottom) / 2 * photoHeight;

  return {
    x: left / width,
    // The shader works in a y-up frame; the projection above is y-down.
    y: 1 - (top + photoHeight) / height,
    width: photoWidth / width,
    height: photoHeight / height,
  };
}
