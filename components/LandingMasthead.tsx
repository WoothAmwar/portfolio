'use client';

import { animate } from 'animejs';
import { useEffect, useRef } from 'react';

/**
 * How far the page has to travel, as a fraction of the viewport, before the
 * greeting has dimmed all the way down. Short enough that the greeting has
 * stepped back by the time the desk starts opening.
 */
const DIM_OVER_VH = 0.4;

const DIM_FLOOR = 0.0;
/** How far the greeting drifts up as it dims. */
const DRIFT_REM = 0.75;

/**
 * The greeting across the top of the landing screen, over the black backdrop
 * and the desk.
 *
 * Its whole job is to be read first and then get out of the way, so it is drawn
 * in an outline face at partial opacity — present, but with none of the mass of
 * a solid headline — and it dims as the visitor scrolls into the reveal. The
 * two are kept on separate elements: the intro animation owns the inner span's
 * opacity, the scroll owns the wrapper's, and multiplying them means neither
 * has to know about the other.
 */
export default function LandingMasthead() {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const text = textRef.current;
    if (!wrapper || !text) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion) {
      text.style.opacity = '1';
    } else {
      animate(text, {
        opacity: [0, 1],
        translateY: ['-0.5rem', '0rem'],
        // The letters draw apart as they arrive, which lands the greeting on
        // the page rather than just switching it on.
        duration: 900,
        delay: 420,
        ease: 'outExpo',
      });
    }

    const onScroll = () => {
      const span = window.innerHeight * DIM_OVER_VH;
      const t = span > 0 ? Math.min(1, window.scrollY / span) : 1;
      // Smoothstep, so the greeting neither drops off the instant the page
      // moves nor hangs at full strength and then falls away.
      const eased = t * t * (3 - 2 * t);
      wrapper.style.opacity = String(1 - (1 - DIM_FLOOR) * eased);
      if (!reduceMotion) wrapper.style.transform = `translateY(${-DRIFT_REM * eased}rem)`;
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    // Covers a reload that restores a scrolled position.
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="absolute inset-x-0 top-[clamp(1.5rem,5vh,3.25rem)] flex justify-center px-[6%]"
      style={{ willChange: 'transform, opacity' }}
    >
      <p
        ref={textRef}
        className="font-display font-semibold m-0 text-center text-7xl whitespace-nowrap"
        style={{
          // fontSize: 'clamp(1.5rem, 4.6vw, 4.25rem)',
          lineHeight: 1,
          opacity: 0,
          // The stroke is warm white rather than pure, and sits under full
          // strength so it reads as lit by the same lamp as the desk.
          color: 'var(--color-foreground-muted)',
          // A hint of the desk's amber bleeding off the letters, which stops
          // the outline looking pasted onto the black.
          textShadow: 'var(--shadow-glow-tan)',
          willChange: 'transform, opacity',
        }}
      >
        Hi, I'm Anwar Kader
      </p>
    </div>
  );
}
