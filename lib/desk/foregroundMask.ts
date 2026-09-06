import * as THREE from 'three';

/**
 * A mask of everything in the photograph that is *not* the desk.
 *
 * This exists because of a hard fact about the image: the laptop cannot be
 * segmented directly. Sampling it shows the laptop and the room behind it are
 * both pure greyscale — saturation 0.00, r-b 0 — with overlapping brightness
 * (the room reads 33-39, the laptop's shaded left side 37-46). No threshold
 * separates them.
 *
 * The desk, on the other hand, is the one thing in the frame that is reliably
 * distinct: warm and saturated, r-b around 12 at saturation 0.6. So the desk is
 * what gets segmented, and this mask is its complement. Drawing through it puts
 * back whatever the model is covering that was never the desk's to hide — the
 * laptop's base above all — and the boundary is the photograph's own desk edge
 * rather than a rectangle anyone had to guess at.
 */
export interface ForegroundMask {
  texture: THREE.DataTexture;
  dispose(): void;
}

/** Bridges the dark seams between the desk's drawer bands. */
const CLOSE_RADIUS = 6;
/** Softens the boundary so the join with the desktop is not stair-stepped. */
const BLUR_RADIUS = 2;

export function buildForegroundMask(
  image: TexImageSource & { width: number; height: number },
): ForegroundMask | null {
  const w = image.width;
  const h = image.height;
  if (w <= 0 || h <= 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image as CanvasImageSource, 0, 0);
  const pixels = context.getImageData(0, 0, w, h).data;

  const count = w * h;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;

  let desk: Uint8Array<ArrayBufferLike> = new Uint8Array(count);
  for (let i = 0, p = 0; p < count; i += 4, p += 1) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const hi = Math.max(r, g, b);
    const lo = Math.min(r, g, b);
    const saturation = hi === 0 ? 0 : (hi - lo) / hi;
    if (r > b + 12 && saturation > 0.18 && hi > 26) desk[p] = 1;
  }

  /** Separable morphology, so the cost stays linear in the radius. */
  const morph = (
    src: Uint8Array<ArrayBufferLike>,
    radius: number,
    dilate: boolean,
  ): Uint8Array<ArrayBufferLike> => {
    const hit = dilate ? 1 : 0;
    const pass = (input: Uint8Array<ArrayBufferLike>, horizontal: boolean) => {
      const out = new Uint8Array(count);
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          let value = dilate ? 0 : 1;
          for (let k = -radius; k <= radius; k += 1) {
            const nx = horizontal ? x + k : x;
            const ny = horizontal ? y : y + k;
            if (!inside(nx, ny)) continue;
            if (input[ny * w + nx] === hit) { value = hit; break; }
          }
          out[y * w + x] = value;
        }
      }
      return out;
    };
    return pass(pass(src, true), false);
  };

  // A closing rather than a plain dilation: the seams between the drawer bands
  // have to be bridged, but the desk's outer edge must stay where it is, or the
  // mask eats into the laptop resting on it.
  desk = morph(morph(desk, CLOSE_RADIUS, true), CLOSE_RADIUS, false);

  // Largest region only, so warm speckle elsewhere in the room is not treated
  // as desk and does not punch holes in what gets drawn back.
  const label = new Int32Array(count).fill(-1);
  const stack: number[] = [];
  let best = -1;
  let bestSize = 0;
  let next = 0;
  for (let p = 0; p < count; p += 1) {
    if (!desk[p] || label[p] !== -1) continue;
    const id = next;
    next += 1;
    let size = 0;
    stack.push(p);
    label[p] = id;
    while (stack.length > 0) {
      const q = stack.pop() as number;
      size += 1;
      const qx = q % w;
      const qy = (q / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = qx + dx;
        const ny = qy + dy;
        if (!inside(nx, ny)) continue;
        const nq = ny * w + nx;
        if (desk[nq] && label[nq] === -1) { label[nq] = id; stack.push(nq); }
      }
    }
    if (size > bestSize) { bestSize = size; best = id; }
  }
  if (best < 0) return null;

  const solid = new Uint8Array(count);
  for (let p = 0; p < count; p += 1) solid[p] = label[p] === best ? 1 : 0;

  // Fill the kneehole and any other enclosed gap. They are surrounded by desk,
  // so the model covers them either way, and leaving them open would draw the
  // room's dark interior over the model's own kneehole.
  const outside = new Uint8Array(count);
  const seed = (p: number) => { if (!solid[p] && !outside[p]) { outside[p] = 1; stack.push(p); } };
  for (let x = 0; x < w; x += 1) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y += 1) { seed(y * w); seed(y * w + w - 1); }
  while (stack.length > 0) {
    const q = stack.pop() as number;
    const qx = q % w;
    const qy = (q / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = qx + dx;
      const ny = qy + dy;
      if (!inside(nx, ny)) continue;
      const nq = ny * w + nx;
      if (!solid[nq] && !outside[nq]) { outside[nq] = 1; stack.push(nq); }
    }
  }
  for (let p = 0; p < count; p += 1) if (!outside[p]) solid[p] = 1;

  // Invert: what is drawn back is everything the desk is not.
  const rows = new Float32Array(count);
  const blurred = new Float32Array(count);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sum = 0;
      let n = 0;
      for (let k = -BLUR_RADIUS; k <= BLUR_RADIUS; k += 1) {
        if (!inside(x + k, y)) continue;
        sum += solid[y * w + x + k] ? 0 : 1;
        n += 1;
      }
      rows[y * w + x] = sum / n;
    }
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sum = 0;
      let n = 0;
      for (let k = -BLUR_RADIUS; k <= BLUR_RADIUS; k += 1) {
        if (!inside(x, y + k)) continue;
        sum += rows[(y + k) * w + x];
        n += 1;
      }
      blurred[y * w + x] = sum / n;
    }
  }

  const data = new Uint8Array(count * 4);
  for (let p = 0; p < count; p += 1) {
    const a = Math.round(THREE.MathUtils.clamp(blurred[p], 0, 1) * 255);
    data[p * 4] = a;
    data[p * 4 + 1] = a;
    data[p * 4 + 2] = a;
    data[p * 4 + 3] = a;
  }

  const texture = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  // Row 0 is the top of the image, and DataTexture does not flip, so this is
  // sampled with the image's own top-down coordinates rather than the photo's.
  texture.flipY = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  return { texture, dispose() { texture.dispose(); } };
}
