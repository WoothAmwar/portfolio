import { createScope, createTimer } from 'animejs';
import 'animejs/adapters/three';
import * as THREE from 'three';

import { buildDesk } from './buildDesk';
import { CAMERA, DRAWER_GLOW_INTENSITY, ENTER, PHOTO_URL, TIMING } from './constants';
import { createDebugOverlay, type DebugOverlay } from './debugOverlay';
import { createBackdrop, type Backdrop } from './backdrop';
import { buildOutline, type Outline } from './outline';
import { deskPlan } from './plan';
import { createProjector } from './projector';
import { photoRectFor, projectSilhouette } from './registration';
import { createPlanDebug, type PlanDebug } from './planDebug';
import {
  OVERHEAD_UP,
  computePoses,
  drawerCentreAt,
  frameFor,
  projectBoxRect,
  projectTopFaceRect,
  type Poses,
} from './framing';
import {
  buildTimeline,
  createScrollTrigger,
  type DeskTimeline,
  type Motion,
} from './scrollTimeline';

export interface MountOptions {
  /** absolutely positioned element the canvas fills */
  host: HTMLElement;
  /** the tall scroll track that drives the timeline */
  section: HTMLElement;
  card: HTMLElement;
  words: HTMLElement[];
  /**
   * Debug mode from `?debug`: '' off, 'on' the framing HUD, 'plan' the plan
   * outline drawn flat on the floor, 'projector' the registration calibrator.
   */
  debug: string;
  /**
   * `?t=` pins the timeline at a fixed position instead of linking it to the
   * scroll, so any single frame of the reveal can be looked at on its own. The
   * whole timeline is seeked, not just the camera, so the drawer, the light and
   * the card all agree with each other at that instant.
   */
  pinT?: number | null;
  /**
   * Called when the reveal lands, and again if it is scrolled back off. The
   * Enter button hangs off this: it must not be pressable while the card is
   * still flying into the drawer.
   */
  onReadyChange?: (ready: boolean) => void;
}

export interface DeskScene {
  /**
   * Whether the scene skipped the scroll choreography. The caller lays the page
   * out, so it needs to know to collapse the scroll track to a single screen.
   */
  reducedMotion: boolean;
  /**
   * Stops the scene without undoing it: the render loop pauses, scrolling stops
   * driving the camera, and the card is handed over to the caller to animate.
   *
   * Deliberately not `destroy()`, which reverts the anime.js scope and would
   * restore the card's pre-animation styles, blanking it mid-transition.
   */
  freeze(): void;
  destroy(): void;
}

function hasWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (probe.getContext('webgl2') || probe.getContext('webgl'))
    );
  } catch {
    return false;
  }
}

/**
 * Builds the desk, wires the scroll timeline to it and drives the render loop.
 * Returns null when WebGL is unavailable, so the caller can fall back to the
 * card on its own.
 */
export function mountDeskScene(options: MountOptions): DeskScene | null {
  const { host, section, card, words, debug, pinT = null, onReadyChange } = options;
  if (!hasWebGL()) return null;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearAlpha(0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far);
  scene.add(camera);

  // Warm key with a cool rim, so brown wood separates from a near-black page.
  // Kept low: the outlines describe the shape, and the fills only have to hold
  // the same tonal register as the photograph the desk has to sit inside.
  const key = new THREE.DirectionalLight(0xffe8cc, 1.15);
  key.position.set(2.2, 3.2, 2.6);
  const rim = new THREE.DirectionalLight(0x9ec6ff, 0.85);
  rim.position.set(-2.8, 1.4, -2.2);
  const fill = new THREE.DirectionalLight(0xffffff, 0.18);
  fill.position.set(-1.4, 0.9, 3);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x2a1c12, 0.3), key, rim, fill);

  const build = buildDesk();
  scene.add(build.group);

  // Attached to the meshes themselves, so the hero drawer's contour travels
  // with it as it opens.
  const outline: Outline = buildOutline(build.group);

  // Pure black, carrying the reference photograph placed so its desk sits under
  // the model's. `onLoad` re-places it, because the placement is measured
  // against the desk rather than the image and so does not wait on the decode.
  // The same photograph, painted onto the desk itself. The registration below
  // is already a projector — it lines the picture up with the model as seen
  // from the opening camera — so the carving comes along for free.
  const projector = createProjector();
  for (const material of build.projectable.fixed) {
    projector.patch(material, projector.staticUniforms);
  }
  for (const material of build.projectable.hero) {
    projector.patch(material, projector.heroUniforms);
  }

  const backdrop: Backdrop = createBackdrop(PHOTO_URL, (texture) => {
    projector.setTexture(texture);
    updateRegistration();
  });
  scene.add(backdrop.mesh, backdrop.foreground);
  /** Tweened by the timeline; read back onto the backdrop every frame. */
  const fade = { photo: 1, laptop: 1 };

  const lookTarget = new THREE.Vector3();
  const motion: Motion = { t: 0 };
  const viewport = { width: 1, height: 1 };

  const applySize = () => {
    const width = host.clientWidth || 1;
    const height = host.clientHeight || 1;
    viewport.width = width;
    viewport.height = height;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    // In the same breath as setSize, never in a separate handler: a stale
    // resolution renders the outlines at the wrong width or drops them entirely.
    const buffer = renderer.getDrawingBufferSize(new THREE.Vector2());
    outline.setResolution(buffer.x, buffer.y);
  };
  applySize();

  let poses: Poses = computePoses(camera, build);
  let scope: ReturnType<typeof createScope> | null = null;
  let timeline: DeskTimeline | null = null;
  let scrollTrigger: ReturnType<typeof createScrollTrigger> | null = null;
  const overlay: DebugOverlay | null = debug ? createDebugOverlay(host) : null;

  // `?debug=plan`: the outline every part is cut from, and its inset ladder.
  const planDebug: PlanDebug | null = debug === 'plan' ? createPlanDebug(deskPlan()) : null;
  if (planDebug) scene.add(planDebug.group);

  /** Once frozen the scene is inert: no render loop, no scroll link, no rebuild. */
  let frozen = false;
  /** While true, every frame re-pins the card to the drawer's projection. */
  let trackCard = true;
  let ready = false;

  const reportReady = (next: boolean) => {
    if (next === ready) return;
    ready = next;
    onReadyChange?.(next);
  };

  /** Reduced motion: no scroll choreography, just the final frame. */
  const applyStaticEndState = () => {
    poses = computePoses(camera, build);
    updateRegistration();
    // Reduced motion shows the closing frame, which is long past the photograph.
    fade.photo = 0;
    fade.laptop = 0;
    build.group.visible = true;
    build.heroDrawer.position.z = build.heroRestZ + build.heroTravel;
    build.heroLight.intensity = DRAWER_GLOW_INTENSITY;
    motion.t = 1;
    card.style.opacity = '1';
    card.style.transform = 'none';
    for (const word of words) {
      word.style.opacity = '1';
      word.style.transform = 'none';
    }
  };

  const rebuild = () => {
    poses = computePoses(camera, build);
    updateRegistration();
    scope?.revert();
    scope = createScope({ root: section }).add(() => {
      scrollTrigger = pinT === null ? createScrollTrigger(section, debug === 'on') : null;
      timeline = buildTimeline({
        motion,
        build,
        card,
        words,
        fade,
        autoplay: scrollTrigger ?? false,
      });
      if (pinT !== null) timeline.seek(THREE.MathUtils.clamp(pinT, 0, 1) * TIMING.duration);
    });
    overlay?.setSummary(describeFraming());
  };

  /** Measures what the two key poses actually frame, for the debug panel. */
  const describeFraming = (): string[] => {
    const position = camera.position.clone();
    const quaternion = camera.quaternion.clone();
    const up = camera.up.clone();

    camera.position.copy(poses.start);
    camera.up.set(0, 1, 0);
    camera.lookAt(poses.startTarget);
    camera.updateMatrixWorld(true);
    const desk = projectBoxRect(build.deskBox, camera, viewport.width, viewport.height);

    camera.position.copy(poses.end);
    camera.up.copy(OVERHEAD_UP);
    camera.lookAt(poses.endTarget);
    camera.updateMatrixWorld(true);
    const drawer = projectTopFaceRect(
      build.heroDrawerOpenBox,
      camera,
      viewport.width,
      viewport.height,
    );

    camera.position.copy(position);
    camera.quaternion.copy(quaternion);
    camera.up.copy(up);
    camera.updateMatrixWorld(true);

    const share = (rect: { width: number; height: number }) =>
      `${((rect.width / viewport.width) * 100).toFixed(1)}% x ${(
        (rect.height / viewport.height) *
        100
      ).toFixed(1)}%`;

    const budget = (spec: Parameters<typeof frameFor>[0]) => {
      const { w, h } = frameFor(spec, camera.aspect);
      return `(budget ${(w * 100).toFixed(0)}% x ${(h * 100).toFixed(0)}%)`;
    };

    return [
      `viewport   ${viewport.width} x ${viewport.height}`,
      `desk t=0   ${share(desk)}  ${budget(CAMERA.startFrame)}`,
      `drawer t=1 ${share(drawer)}  ${budget(CAMERA.endFrame)}`,
      ...(planDebug ? ['', ...planDebug.summary()] : []),
    ];
  };

  /**
   * Places the photograph under the desk, measured at the opening pose.
   *
   * The camera is borrowed for the measurement and put back: at any other point
   * on the timeline the desk is somewhere else entirely, and the photograph is
   * only ever seen at the start.
   */
  const updateRegistration = () => {
    const position = camera.position.clone();
    const quaternion = camera.quaternion.clone();
    const up = camera.up.clone();

    camera.position.copy(poses.start);
    camera.up.set(0, 1, 0);
    camera.lookAt(poses.startTarget);
    camera.updateMatrixWorld(true);
    const silhouette = projectSilhouette(build.group, camera, viewport.width, viewport.height);
    const rect = photoRectFor(silhouette, viewport.width, viewport.height);
    // Set while the camera is still at the opening pose: this pose *is* the
    // projector, so it has to be read before the camera is handed back.
    projector.setProjection(
      camera,
      new THREE.Vector4(rect.x, rect.y, rect.width, rect.height),
    );

    camera.position.copy(position);
    camera.quaternion.copy(quaternion);
    camera.up.copy(up);
    camera.updateMatrixWorld(true);

    backdrop.setRect(rect);
  };

  const drawerBox = new THREE.Box3();
  const drawerOffset = new THREE.Vector3();
  const aimCentre = new THREE.Vector3();
  const toCamera = new THREE.Vector3();
  // Horizontal direction from the aim point out to the camera. It is held
  // through the last few frames, where the camera is directly overhead and the
  // direction is no longer defined; by then the path has brought it to +X.
  const azimuth = new THREE.Vector3(1, 0, 0);

  const renderFrame = () => {
    poses.cameraPath.at(motion.t, camera.position);
    // Aim at where the drawer is now, not where it will end up, so that once
    // the aim locks on there is nothing left to catch up with.
    drawerCentreAt(build, motion.t * TIMING.duration, aimCentre);
    lookTarget.copy(poses.startTarget).lerp(aimCentre, poses.aimPath.at(motion.t));

    // The roll-free up vector for the camera's current elevation. Orthogonal-
    // ising world up against the view direction gives the same answer wherever
    // it is defined, but goes singular looking straight down; this stays exact
    // all the way into the overhead shot, and lands on OVERHEAD_UP there.
    toCamera.subVectors(camera.position, lookTarget);
    const horizontal = Math.hypot(toCamera.x, toCamera.z);
    if (horizontal > 1e-4) azimuth.set(toCamera.x / horizontal, 0, toCamera.z / horizontal);
    const elevation = Math.atan2(toCamera.y, horizontal);
    const sin = Math.sin(elevation);
    camera.up.set(-sin * azimuth.x, Math.cos(elevation), -sin * azimuth.z).normalize();

    camera.lookAt(lookTarget);
    camera.updateMatrixWorld(true);

    // Held back at the very start, so the reveal opens on the photograph alone
    // and the model arrives over it. Nothing else has to know: the registration
    // is measured from the geometry, not from what is on screen, so the picture
    // is already placed for a desk that has not been drawn yet.
    build.group.visible = motion.t * TIMING.duration >= TIMING.deskAppears;

    backdrop.setOpacity(fade.photo);
    backdrop.setLaptopOpacity(fade.laptop);
    // The projection is fixed in world space, so the drawer has to carry its
    // own share of it as it travels or the texture swims across its face.
    projector.setHeroOffset(build.heroDrawer.position.z - build.heroRestZ);

    // Pin the card to the drawer's projected opening, until the enter
    // transition takes the card over.
    drawerOffset.set(0, 0, build.heroDrawer.position.z - build.heroRestZ);
    drawerBox.copy(build.heroDrawerBox).translate(drawerOffset);
    const rect = projectTopFaceRect(drawerBox, camera, viewport.width, viewport.height);
    if (trackCard) {
      card.style.left = `${rect.left}px`;
      card.style.top = `${rect.top}px`;
      card.style.width = `${rect.width}px`;
      card.style.height = `${rect.height}px`;
    }

    const progress = timeline ? timeline.progress : 1;
    // Readiness follows the scroll position, not the damped playhead above.
    reportReady((scrollTrigger ? scrollTrigger.progress : 1) >= ENTER.readyProgress);

    overlay?.update({
      progress,
      rect,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    });

    renderer.render(scene, camera);
  };

  if (reduceMotion) {
    applyStaticEndState();
    if (overlay) overlay.setSummary(describeFraming());
    renderFrame();
  } else {
    rebuild();
  }

  const timer = reduceMotion ? null : createTimer({ onUpdate: renderFrame });

  let resizeHandle = 0;
  const resizeObserver = new ResizeObserver(() => {
    window.clearTimeout(resizeHandle);
    resizeHandle = window.setTimeout(() => {
      // A frozen scene must stay frozen: rebuilding here would re-link the
      // timeline to the scroll and bring the desk back behind the white page.
      if (frozen) return;
      applySize();
      if (reduceMotion) {
        applyStaticEndState();
        renderFrame();
      } else {
        // Rebuilding re-solves both framing distances; because the timeline is
        // scroll-linked it re-syncs to the current scroll position at once.
        rebuild();
      }
    }, 150);
  });
  resizeObserver.observe(host);

  return {
    reducedMotion: reduceMotion,
    freeze() {
      if (frozen) return;
      frozen = true;
      trackCard = false;
      timer?.pause();
      scrollTrigger?.revert();
      scrollTrigger = null;
    },
    destroy() {
      resizeObserver.disconnect();
      window.clearTimeout(resizeHandle);
      timer?.cancel();
      scope?.revert();
      overlay?.destroy();
      planDebug?.dispose();
      outline.dispose();
      backdrop.dispose();
      build.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
