import { createTimeline, onScroll, stagger } from 'animejs';
import 'animejs/adapters/three';
import type { DeskBuild } from './buildDesk';
import { DRAWER_GLOW_INTENSITY, TIMING } from './constants';

export type DeskTimeline = ReturnType<typeof createTimeline>;

/**
 * Normalised position along the camera path. The path itself is a monotone
 * cubic (see `framing.ts`), so advancing this one scalar linearly is what makes
 * the move continuous: there is no per-waypoint easing to stall at, and no axis
 * that can double back.
 */
export interface Motion {
  t: number;
}

type TimelineParams = NonNullable<Parameters<typeof createTimeline>[0]>;

/**
 * Links the timeline to the scroll track: progress 0 when the section pins,
 * 1 when it unpins. `sync` is damped rather than locked, so the camera carries
 * a little weight instead of snapping to the scrollbar.
 */
export function createScrollTrigger(section: HTMLElement, debug: boolean) {
  return onScroll({
    target: section,
    enter: 'top top',
    leave: 'bottom bottom',
    sync: 0.2,
    debug,
  });
}

export interface TimelineDeps {
  motion: Motion;
  build: DeskBuild;
  card: HTMLElement;
  words: HTMLElement[];
  /**
   * The backdrop photograph's opacity and the laptop cut-out's, read back onto
   * the scene each frame.
   */
  fade: { photo: number; laptop: number };
  /** what drives playback: a scroll trigger in the app, `false` in tests */
  autoplay: TimelineParams['autoplay'];
}

/**
 * The whole reveal as one scroll-linked timeline. Because every beat is a tween
 * on a single progress-linked timeline, scrolling back up replays all of them in
 * reverse with no extra code.
 */
export function buildTimeline(deps: TimelineDeps): DeskTimeline {
  const { motion, build, card, words, fade, autoplay } = deps;

  const timeline = createTimeline({
    defaults: { ease: 'inOutSine', duration: TIMING.duration },
    autoplay,
  });

  // Steps 1-3: the whole camera move, as one linear sweep along the path.
  timeline.add(
    motion,
    {
      t: { from: 0, to: 1 },
      ease: 'linear',
    },
    0,
  );

  // The photograph hands over to the model. It goes early and quickly: it is a
  // fixed 2D plate, so the longer it is held the further the moving camera's
  // perspective drifts from the one it was taken with.
  timeline.add(
    fade,
    {
      photo: { from: 1, to: 0 },
      duration: TIMING.backdropFadeEnd,
      ease: 'inQuad',
    },
    0,
  );

  // The laptop standing on the photograph's desk is drawn over the model, which
  // would otherwise cut it off at the keyboard. It goes on the same beat as the
  // photograph behind it, so the desk closes up as the room dissolves.
  timeline.add(
    fade,
    {
      laptop: { from: 1, to: 0 },
      duration: TIMING.laptopFadeEnd,
      ease: 'inQuad',
    },
    0,
  );

  // Step 2: the drawer is pulled out, decelerating into its fully open position.
  timeline.add(
    build.heroDrawer,
    {
      z: { from: build.heroRestZ, to: build.heroRestZ + build.heroTravel },
      duration: TIMING.drawerEnd - TIMING.drawerStart,
      // A hand pulling a drawer eases in and out; a front-loaded ease reads as
      // a snap, which is the one thing this beat must not do.
      ease: 'inOutCubic',
    },
    TIMING.drawerStart,
  );

  // The drawer interior lifts out of the dark as it opens, blooming at the end.
  timeline.add(
    build.heroLight,
    {
      intensity: { from: 0, to: DRAWER_GLOW_INTENSITY },
      duration: TIMING.duration - TIMING.glowStart,
      ease: 'outQuad',
    },
    TIMING.glowStart,
  );

  // Step 5: the card settles into the open drawer.
  timeline.add(
    card,
    {
      opacity: { from: 0, to: 1 },
      scale: { from: 0.96, to: 1 },
      duration: TIMING.duration - TIMING.cardStart,
      ease: 'outCubic',
    },
    TIMING.cardStart,
  );

  if (words.length > 0) {
    // Size the stagger so the last word lands exactly on the final frame.
    const window = TIMING.duration - TIMING.textStart;
    const wordDuration = window * 0.5;
    const wordStagger = words.length > 1 ? (window - wordDuration) / (words.length - 1) : 0;
    timeline.add(
      words,
      {
        opacity: { from: 0, to: 1 },
        translateY: { from: '0.45em', to: '0em' },
        duration: wordDuration,
        delay: stagger(wordStagger),
        ease: 'outQuad',
      },
      TIMING.textStart,
    );
  }

  return timeline;
}
