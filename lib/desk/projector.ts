import * as THREE from 'three';

import { PROJECTION } from './constants';

/**
 * Paints the reference photograph onto the desk.
 *
 * The projector is the opening camera, and the photograph is mapped through the
 * same screen rectangle the backdrop uses — so a surface takes the colour of
 * whatever part of the photograph was covering it at t=0. That is what carries
 * the carved drawer fronts, which are far too fine to model in geometry, onto
 * the model itself.
 *
 * Unlike the backdrop, this does not fade. The projection is fixed in world
 * space, so once it is applied the carving stays on the desk from every angle
 * the camera reaches, including the overhead closing shot.
 *
 * Only exterior materials are given this treatment. The drawer interior and the
 * folders appear nowhere in the photograph, and the drawer's inner back panel
 * faces the projector while hidden behind its own front — it would otherwise be
 * painted with the outside of the desk. Leaving them out is both free and right,
 * and is why no depth pass is needed to resolve occlusion.
 */
export interface ProjectorUniforms {
  uProjMatrix: { value: THREE.Matrix4 };
  uProjPosition: { value: THREE.Vector3 };
  uProjRect: { value: THREE.Vector4 };
  uProjStrength: { value: number };
  uProjTexture: { value: THREE.Texture | null };
  uProjReady: { value: number };
  /**
   * Subtracted from world position before projecting. The projection is fixed in
   * world space, so without this the hero drawer would swim through the texture
   * as it opens instead of carrying its own face with it.
   */
  uProjOffset: { value: THREE.Vector3 };
}

function makeUniforms(): ProjectorUniforms {
  return {
    uProjMatrix: { value: new THREE.Matrix4() },
    uProjPosition: { value: new THREE.Vector3() },
    uProjRect: { value: new THREE.Vector4(0, 0, 1, 1) },
    uProjStrength: { value: PROJECTION.strength },
    uProjTexture: { value: null },
    uProjReady: { value: 0 },
    uProjOffset: { value: new THREE.Vector3() },
  };
}

const VERTEX_DECL = /* glsl */ `
  varying vec3 vProjWorld;
  varying vec3 vProjNormal;
`;

const VERTEX_BODY = /* glsl */ `
  vProjWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
  // Correct only because nothing in this scene is ever non-uniformly scaled;
  // geometry is built at true size and offsets go on the mesh, not the vertices.
  vProjNormal = normalize( mat3( modelMatrix ) * objectNormal );
`;

const FRAGMENT_DECL = /* glsl */ `
  uniform mat4 uProjMatrix;
  uniform vec3 uProjPosition;
  uniform vec4 uProjRect;
  uniform float uProjStrength;
  uniform sampler2D uProjTexture;
  uniform float uProjReady;
  uniform vec3 uProjOffset;
  varying vec3 vProjWorld;
  varying vec3 vProjNormal;
`;

const FRAGMENT_BODY = /* glsl */ `
  if ( uProjReady > 0.5 ) {
    vec3 projWorld = vProjWorld - uProjOffset;
    vec4 projClip = uProjMatrix * vec4( projWorld, 1.0 );
    if ( projClip.w > 0.0 ) {
      vec2 screen = ( projClip.xy / projClip.w ) * 0.5 + 0.5;
      vec2 uv = ( screen - uProjRect.xy ) / uProjRect.zw;
      if ( all( greaterThanEqual( uv, vec2( 0.0 ) ) ) && all( lessThanEqual( uv, vec2( 1.0 ) ) ) ) {
        // Falls away as a surface turns from the projector. Grazing surfaces
        // are where the photograph's texels are stretched worst, so this both
        // resolves most of the occlusion and hides the smearing.
        vec3 toProjector = normalize( uProjPosition - projWorld );
        float facing = pow( clamp( dot( normalize( vProjNormal ), toProjector ), 0.0, 1.0 ), 2.5 );
        float w = facing * uProjStrength;
        vec3 shot = texture2D( uProjTexture, uv ).rgb;
        diffuseColor.rgb = mix( diffuseColor.rgb, shot, w );
        // The photograph already carries its own light. Flattening the response
        // where it takes over stops the scene's key lighting it a second time.
        roughnessFactor = mix( roughnessFactor, 1.0, w * 0.8 );
      }
    }
  }
`;

/**
 * Module-level so every patched material shares one program cache key: the
 * default key is this function's source, so a per-material closure would
 * recompile the shader once per material.
 */
function compile(shader: { vertexShader: string; fragmentShader: string }): void {
  shader.vertexShader = VERTEX_DECL + shader.vertexShader.replace(
    '#include <project_vertex>',
    '#include <project_vertex>\n' + VERTEX_BODY,
  );
  // Anchored after the roughness chunk, not the map chunk: `roughnessFactor` is
  // declared by `roughnessmap_fragment`, so at `map_fragment` it does not exist
  // yet. `diffuseColor` is declared above both and is still in scope here.
  //
  // Appended, never replaced: these chunks are wrapped in `#ifdef` guards and
  // can expand to nothing, so replacing one would work only by accident.
  shader.fragmentShader = FRAGMENT_DECL + shader.fragmentShader.replace(
    '#include <roughnessmap_fragment>',
    '#include <roughnessmap_fragment>\n' + FRAGMENT_BODY,
  );
}

export interface Projector {
  /** materials fixed in world space */
  staticUniforms: ProjectorUniforms;
  /** materials that travel with the hero drawer */
  heroUniforms: ProjectorUniforms;
  patch(material: THREE.MeshStandardMaterial, uniforms: ProjectorUniforms): void;
  setTexture(texture: THREE.Texture): void;
  setProjection(camera: THREE.Camera, rect: THREE.Vector4Like): void;
  setHeroOffset(z: number): void;
}

export function createProjector(): Projector {
  const staticUniforms = makeUniforms();
  const heroUniforms = makeUniforms();
  const both = [staticUniforms, heroUniforms];

  return {
    staticUniforms,
    heroUniforms,
    patch(material, uniforms) {
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        compile(shader);
      };
      material.needsUpdate = true;
    },
    setTexture(texture) {
      for (const u of both) {
        u.uProjTexture.value = texture;
        u.uProjReady.value = 1;
      }
    },
    setProjection(camera, rect) {
      for (const u of both) {
        u.uProjMatrix.value.multiplyMatrices(
          (camera as THREE.PerspectiveCamera).projectionMatrix,
          camera.matrixWorldInverse,
        );
        u.uProjPosition.value.setFromMatrixPosition(camera.matrixWorld);
        u.uProjRect.value.set(rect.x, rect.y, rect.z, rect.w);
      }
    },
    setHeroOffset(z) {
      heroUniforms.uProjOffset.value.set(0, 0, z);
    },
  };
}
