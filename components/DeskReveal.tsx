'use client';

import { animate } from 'animejs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ENTER, SCROLL_TRACK_VH } from '@/lib/desk/constants';
import { mountDeskScene, type DeskScene } from '@/lib/desk/scene';
import LandingMasthead from './LandingMasthead';
import MainPagePanel from './MainPagePanel';

const WORDS = ['Welcome' ,'to', 'my', 'Desk.' ];

export default function DeskReveal() {
  const router = useRouter();

  const sectionRef = useRef<HTMLElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const descriptorRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const mainpageRef = useRef<HTMLElement | null>(null);
  const wordsRef = useRef<Array<HTMLSpanElement | null>>([]);
  const sceneRef = useRef<DeskScene | null>(null);

  /** The reveal has landed, so the button can be pressed. */
  const [ready, setReady] = useState(false);
  /** The card has grown to fill the screen and the welcome section is in. */
  const [entered, setEntered] = useState(false);
  /** No scroll choreography to make room for: reduced motion, or no WebGL. */
  const [staticLayout, setStaticLayout] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    const host = hostRef.current;
    const card = cardRef.current;

    if (!section || !host || !card) return;

    const words = wordsRef.current.filter((word): word is HTMLSpanElement => word !== null);
    // `?debug` turns on the framing HUD; `?debug=plan` and `?debug=projector`
    // select the calibration views instead.
    const params = new URLSearchParams(window.location.search);
    const debug = params.has('debug') ? params.get('debug') || 'on' : '';
    const rawT = params.get('t');
    const pinT = rawT === null || rawT === '' ? null : Number(rawT);
    const scene = mountDeskScene({
      host,
      section,
      card,
      words,
      debug,
      pinT: pinT !== null && Number.isFinite(pinT) ? pinT : null,
      onReadyChange: setReady,
    });
    sceneRef.current = scene;

    if (!scene) {
      // No WebGL: drop the scroll choreography and show the card on its own.
      // Its box is set in pixels, like the scene sets it, so the enter
      // transition animates from the same kind of value either way.
      setStaticLayout(true);
      card.style.left = `${host.clientWidth * 0.15}px`;
      card.style.top = `${host.clientHeight * 0.075}px`;
      card.style.width = `${host.clientWidth * 0.7}px`;
      card.style.height = `${host.clientHeight * 0.85}px`;
      card.style.opacity = '1';
      for (const word of words) word.style.opacity = '1';
      setReady(true);
      return;
    }

    if (scene.reducedMotion) setStaticLayout(true);

    return () => {
      scene.destroy();
      sceneRef.current = null;
    };
  }, []);

  // The button arrives with the card and leaves again if the reveal is scrolled
  // back off, so it is only ever pressable when pressing it makes sense.
  useEffect(() => {
    const button = buttonRef.current;
    const descriptor = descriptorRef.current;
    if (!button || !descriptor || entered) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      button.style.opacity = ready ? '1' : '0';
      descriptor.style.opacity = ready ? '1' : '0';
      return;
    }
    animate(
      [button, descriptor],
      ready
        ? { opacity: [0, 1], translateY: ['0.6em', '0em'], duration: 420, ease: 'outQuad' }
        : { opacity: 0, duration: 160, ease: 'outQuad' },
    );
  }, [ready, entered]);

  const handleEnter = useCallback(() => {
    const card = cardRef.current;
    const host = hostRef.current;
    const button = buttonRef.current;
    const descriptor = descriptorRef.current;
    if (!card || !host || !descriptor || entered) return;

    // Freeze before touching the card. Until the scene stops, its render loop
    // rewrites the card's box every frame and nothing here would survive a
    // single tick. Freezing also leaves the card's styles alone, which
    // destroying it would not.
    sceneRef.current?.freeze();

    // Freezing stops the timeline wherever its damped playhead happened to be,
    // which is close to the end but not on it. Pin the card and the greeting to
    // their finished values, or the white page keeps a percent of transparency
    // and a hair of scale for good.
    card.style.opacity = '1';
    card.style.transform = 'none';
    for (const word of wordsRef.current) {
      if (!word) continue;
      word.style.opacity = '1';
      word.style.transform = 'none';
    }

    const finish = () => {
      // Scroll to the top while the track is still tall. The card covers the
      // viewport so this is invisible, and it means collapsing the track in the
      // same breath cannot clamp the scroll position and skip the visitor past
      // the welcome section before it has had a chance to scroll there.
      window.scrollTo(0, 0);
      setEntered(true);
      router.push('/info')
    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (button) button.style.opacity = '0';
      if (descriptor) descriptor.style.opacity = '0';
      card.style.left = '0px';
      card.style.top = '0px';
      card.style.width = `${host.clientWidth}px`;
      card.style.height = `${host.clientHeight}px`;
      card.style.borderRadius = '0px';
      finish();
      return;
    }

    if (button) {
      animate(button, {
        opacity: 0,
        scale: 0.94,
        duration: ENTER.buttonFade,
        ease: 'outQuad',
      });
    }
    if (descriptor) {
      animate(descriptor, {
        opacity: 0,
        scale: 0.94,
        duration: ENTER.buttonFade,
        ease: 'outQuad',
      });
    }

    animate(card, {
      left: 0,
      top: 0,
      width: host.clientWidth,
      height: host.clientHeight,
      borderRadius: 0,
      duration: ENTER.expandDuration,
      ease: ENTER.expandEase,
      onComplete: finish,
    });
  }, [entered]);

  // Once the section is in the document, glide down into it.
  useEffect(() => {
    if (!entered) return;

    // The full-bleed class has committed by now, so the pixel box the card grew
    // to can be handed back to CSS. Doing this any earlier leaves a frame where
    // the card is sized by neither.
    const card = cardRef.current;
    if (card) {
      for (const property of ['left', 'top', 'width', 'height']) {
        card.style.removeProperty(property);
      }
    }

    const panel = mainpageRef.current;
    if (!panel) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const frame = requestAnimationFrame(() => {
      panel.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      panel.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [entered]);

  const trackHeight = entered || staticLayout ? '100vh' : `${SCROLL_TRACK_VH}vh`;

  return (
    <>
    {!entered &&
      <section ref={sectionRef} style={{ height: trackHeight }} className="relative w-full">
        <div className="sticky top-0 h-screen w-full overflow-hidden">
          {/* Pure black under the canvas. The reference photograph itself is
              drawn inside the scene, not here, so that it shares a framebuffer
              with the desk that has to cover it and cannot drift out of
              alignment with it. This only has to stop the page colour showing
              through before WebGL has painted its first frame. */}
          <div ref={backdropRef} aria-hidden className="desk-backdrop absolute inset-0" />

          {/* The desk. Its canvas is transparent, so the page colour shows through. */}
          <div ref={hostRef} aria-hidden className="absolute inset-0" />

          

          {/* Position and size are driven per frame from the drawer's
              projection, until Enter hands the card over to CSS. */}
          <div
            ref={cardRef}
            className={`desk-card pointer-events-none absolute flex flex-col items-center justify-center gap-[3vh] overflow-hidden px-[6%] opacity-0 ${
              entered ? 'inset-0 rounded-none' : 'rounded-[3px]'
            }`}
            style={{
              transformOrigin: 'center',
              willChange: 'transform, opacity',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <h1
              className="text-center font-semibold leading-[1.05] tracking-[-0.02em]"
              style={{ fontSize: 'clamp(1.4rem, 4.2vw, 4.6rem)' }}
            >
              {WORDS.map((word, index) => (
                <span
                  key={word}
                  ref={(element) => {
                    wordsRef.current[index] = element;
                  }}
                  className="inline-block opacity-0"
                  style={{ willChange: 'transform, opacity' }}
                >
                  {word}
                  {index < WORDS.length - 1 ? '\u00a0' : ''}
                </span>
              ))}
            </h1>

            <div ref={descriptorRef} className="text-4xl" style={{ willChange: 'transform, opacity' }}>
              Please, take a seat.
            </div>

            <button
              ref={buttonRef}
              type="button"
              onClick={handleEnter}
              disabled={!ready || entered}
              aria-hidden={!ready || entered}
              className="desk-cta pointer-events-auto rounded-full border px-[1.7em] py-[0.65em] text-[clamp(0.78rem,1.05vw,1rem)] font-medium tracking-[0.02em] transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default"
              style={{ willChange: 'transform, opacity' }}
            >
              Click to Take a Seat
            </button>
            {/* <Link href="/info"
            className="desk-cta pointer-events-auto rounded-full border px-[1.7em] py-[0.65em] text-[clamp(0.78rem,1.05vw,1rem)] font-medium tracking-[0.02em] transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default"
            >
              Click to Take a Seat
            </Link> */}
          </div>

          {/* The greeting, over the backdrop and the desk but declared before
              the card, so the card paints over it as it grows to fill the
              screen rather than leaving it stranded on the white page. */}
          <LandingMasthead />
        </div>
      </section>
      }

      {entered && <MainPagePanel ref={mainpageRef} />}
    </>
  );
}
