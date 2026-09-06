import * as THREE from 'three';

import { REGISTRATION } from './constants';
import { buildForegroundMask, type ForegroundMask } from './foregroundMask';
import type { PhotoRect } from './registration';

export interface Backdrop {
  mesh: THREE.Mesh;
  /**
   * The laptop, drawn back over the desk that would otherwise cut it off.
   * Added to the scene separately so it can sit after the desk in draw order.
   */
  foreground: THREE.Mesh;
  setRect(rect: PhotoRect): void;
  /** 1 shows the photograph, 0 leaves the black ground it sits on. */
  setOpacity(value: number): void;
  /** 1 shows the laptop over the desk, 0 leaves the desk whole. */
  setLaptopOpacity(value: number): void;
  dispose(): void;
}

const VERTEX = /* glsl */ `
  varying vec2 vScreen;
  void main() {
    // The plane spans -1..1, so its own coordinates are already clip space.
    vScreen = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D uPhoto;
  uniform vec4 uRect;
  uniform float uOpacity;
  uniform float uHasPhoto;
  uniform float uFeather;
  varying vec2 vScreen;

  void main() {
    vec3 colour = vec3(0.0);
    vec2 uv = (vScreen - uRect.xy) / uRect.zw;
    if (uHasPhoto > 0.5 && uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
      // Sampled and written raw. The texture carries no colour-space decode, so
      // these are the photograph's own sRGB values reaching the framebuffer
      // unchanged, which is what makes the black around it match the black
      // inside it exactly.
      // Feathered to black at its borders. The photograph's own edges are very
      // dark but not actually black, so a hard cut leaves a faintly visible
      // rectangle floating on the ground; fading the last few percent makes the
      // join disappear. The desk's own bottom edge falls inside this band, but
      // the model covers it, so nothing that matters is dimmed.
      vec2 e = smoothstep(vec2(0.0), vec2(uFeather), uv)
             * smoothstep(vec2(0.0), vec2(uFeather), 1.0 - uv);
      colour = texture2D(uPhoto, uv).rgb * uOpacity * e.x * e.y;
    }
    gl_FragColor = vec4(colour, 1.0);
  }
`;

/**
 * Puts the laptop back over the desk that would otherwise cut it off.
 *
 * The vertical boundary is not authored: it is the photograph's own desk edge,
 * read from the mask in `foregroundMask.ts`. That matters because the laptop
 * cannot be segmented directly — it and the room behind it are both flat grey
 * with overlapping brightness — while the desk can, so the desk's complement is
 * what defines where the model is entitled to cover the picture and where it is
 * not. The horizontal gate keeps the correction over the laptop rather than
 * lifting the whole room over the desk's back edge.
 *
 * Where this pass overlaps the backdrop rather than the desk it is invisible by
 * construction: it draws the same pixel the backdrop already drew, at the same
 * opacity, so the blend resolves to exactly what was there. Only where the desk
 * had covered the photograph does it change anything.
 */
const FOREGROUND_FRAGMENT = /* glsl */ `
  uniform sampler2D uPhoto;
  uniform sampler2D uForeground;
  uniform vec4 uRect;
  uniform vec3 uWindow;
  uniform vec2 uWindowFeather;
  uniform float uOpacity;
  uniform float uHasMask;
  varying vec2 vScreen;

  void main() {
    if (uHasMask < 0.5 || uOpacity <= 0.001) discard;

    vec2 uv = (vScreen - uRect.xy) / uRect.zw;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;

    // The mask is stored top-down, the way the image is; the sampling frame here
    // runs up from the bottom.
    vec2 image = vec2(uv.x, 1.0 - uv.y);

    // Sides, and a floor just under the laptop's base. Below that the desk is
    // the model's to draw, kneehole and plinth included.
    float gate = smoothstep(uWindow.x - uWindowFeather.x, uWindow.x, image.x)
               * smoothstep(uWindow.y + uWindowFeather.x, uWindow.y, image.x)
               * smoothstep(uWindow.z + uWindowFeather.y, uWindow.z, image.y);
    if (gate <= 0.002) discard;

    float alpha = texture2D(uForeground, image).a * gate * uOpacity;
    if (alpha <= 0.003) discard;
    gl_FragColor = vec4(texture2D(uPhoto, uv).rgb, alpha);
  }
`;

/**
 * The ground the reveal opens on: pure black, with the reference photograph
 * placed on it so its desk sits exactly under the model's.
 *
 * It is a quad in the scene rather than a CSS background because it has to be
 * the same surface the desk is drawn onto — sharing one framebuffer, one clear,
 * and one set of pixels. A CSS layer behind a transparent canvas cannot be
 * blended against, and would have to keep its own copy of the placement maths.
 */
export function createBackdrop(
  url: string,
  onLoad?: (texture: THREE.Texture) => void,
): Backdrop {
  const uniforms = {
    uPhoto: { value: null as THREE.Texture | null },
    uRect: { value: new THREE.Vector4(0, 0, 1, 1) },
    uOpacity: { value: 1 },
    uHasPhoto: { value: 0 },
    uFeather: { value: 0.05 },
  };

  const foregroundUniforms = {
    uPhoto: uniforms.uPhoto,
    uRect: uniforms.uRect,
    uForeground: { value: null as THREE.Texture | null },
    uHasMask: { value: 0 },
    uWindow: {
      value: new THREE.Vector3(
        REGISTRATION.laptopWindow.left,
        REGISTRATION.laptopWindow.right,
        REGISTRATION.laptopWindow.bottom,
      ),
    },
    uWindowFeather: {
      value: new THREE.Vector2(
        REGISTRATION.laptopWindow.sideFeather,
        REGISTRATION.laptopWindow.bottomFeather,
      ),
    },
    uOpacity: { value: 1 },
  };
  let foregroundMask: ForegroundMask | null = null;

  const texture = new THREE.TextureLoader().load(url, (loaded) => {
    // No decode: the shader writes these values straight out, so the picture
    // reaches the screen as the picture rather than as a tone-mapped version.
    loaded.colorSpace = THREE.NoColorSpace;
    loaded.minFilter = THREE.LinearMipmapLinearFilter;
    loaded.magFilter = THREE.LinearFilter;
    loaded.wrapS = THREE.ClampToEdgeWrapping;
    loaded.wrapT = THREE.ClampToEdgeWrapping;
    loaded.needsUpdate = true;
    uniforms.uHasPhoto.value = 1;

    const source = loaded.image as (TexImageSource & { width: number; height: number }) | undefined;
    if (source && source.width > 0) {
      foregroundMask = buildForegroundMask(source);
      if (foregroundMask) {
        foregroundUniforms.uForeground.value = foregroundMask.texture;
        foregroundUniforms.uHasMask.value = 1;
      }
    }

    onLoad?.(loaded);
  });
  uniforms.uPhoto.value = texture;

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  // Drawn before everything else, and never written to the depth buffer, so the
  // desk lands on top of it whatever order the rest of the scene resolves in.
  mesh.renderOrder = -1;

  const foregroundMaterial = new THREE.ShaderMaterial({
    uniforms: foregroundUniforms,
    vertexShader: VERTEX,
    fragmentShader: FOREGROUND_FRAGMENT,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const foreground = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), foregroundMaterial);
  foreground.frustumCulled = false;
  // After the desk and after its contour lines, both of which the laptop stands
  // in front of.
  foreground.renderOrder = 5;

  return {
    mesh,
    foreground,
    setRect(rect) {
      uniforms.uRect.value.set(rect.x, rect.y, rect.width, rect.height);
    },
    setOpacity(value) {
      uniforms.uOpacity.value = value;
    },
    setLaptopOpacity(value) {
      foregroundUniforms.uOpacity.value = value;
    },
    dispose() {
      texture.dispose();
      material.dispose();
      mesh.geometry.dispose();
      foregroundMaterial.dispose();
      foreground.geometry.dispose();
      foregroundMask?.dispose();
    },
  };
}
