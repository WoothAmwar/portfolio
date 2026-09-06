'use client';

import { animate } from 'animejs';
import { Children, useEffect, useId, useRef, useState, type ReactNode } from 'react';

/**
 * An open book. Children are consumed two at a time — `children[0]` and `[1]`
 * are the left and right pages of the first spread, `[2]` and `[3]` the second,
 * and so on — and the controls flanking the book turn a single leaf between
 * them.
 *
 * The turn is a real one: one sheet hinges at the spine, lifts, and rotates 180°
 * across to land on the other side, showing the page it left on its front face
 * and the page it arrives as on its back. That means four pages are on screen at
 * once mid-turn, which is what most of the machinery below is for.
 *
 * Note that a page child is unmounted and remounted when it moves between the
 * static half and the turning leaf, so state living inside a page (an open
 * `<details>`, an uncontrolled input) does not survive a turn. Pages are meant
 * to be presentational.
 */

/** Long enough to read as paper with weight, short enough to click through. */
const TURN_DURATION = 780;
const TURN_EASE = 'inOutQuad';

type FlipPhase = 'idle' | 'forward' | 'backward';

/**
 * Trim for one page surface, keyed by the half of the book it belongs to. The
 * rounding and the striation go on the outer edge; the shade gradient falls the
 * other way, toward whichever edge is acting as the hinge.
 */
const SIDE_TRIM = {
  left: {
    edge: 'journal-edge-left',
    round: 'rounded-l-[3px]',
    shade: 'journal-shade-right',
    pad: 'pl-[clamp(1.1rem,3vw,2.5rem)]',
  },
  right: {
    edge: 'journal-edge-right',
    round: 'rounded-r-[3px]',
    shade: 'journal-shade-left',
    pad: 'pr-[clamp(1.1rem,3vw,2.5rem)]',
  },
} as const;

/**
 * Slots past either end of the deck render as blank paper. That is the whole of
 * the odd-child-count story — the book always opens flat, so an unpaired last
 * page simply faces an empty one, and no padding of the array is needed.
 */
function pageAt(pages: ReactNode[], index: number): ReactNode {
  return index >= 0 && index < pages.length ? pages[index] : null;
}

/**
 * One sheet of paper. Used for both the static halves and the two faces of the
 * turning leaf, because at the start and end of a turn the leaf must be pixel
 * identical to the half it covers — sharing the markup is what guarantees it.
 */
function JournalFace({
  side,
  withShade,
  flipped,
  className,
  children,
}: {
  side: 'left' | 'right';
  withShade?: boolean;
  flipped?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const trim = SIDE_TRIM[side];

  return (
    <div
      className={`journal-page ${trim.edge} ${trim.round} overflow-hidden ${className ?? ''}`}
      // The back face is turned to face away from the reader. Without this both
      // faces point the same way, backface-visibility hides neither, and the one
      // later in the DOM paints over the other — which shows the destination
      // page the instant the turn starts.
      style={flipped ? { transform: 'rotateY(180deg)' } : undefined}
    >
      <div
        className={`h-full overflow-y-auto overscroll-contain p-[clamp(0.9rem,2.4vw,2rem)] ${trim.pad} text-[clamp(0.7rem,1.15vw,0.95rem)] leading-[1.55]`}
      >
        {children}
      </div>
      {/* The shadow the lifting leaf casts across its own printed side. It sits
          above the content because that is where a real one would fall. */}
      {withShade && (
        <div aria-hidden className={`${trim.shade} pointer-events-none absolute inset-0`} />
      )}
    </div>
  );
}

/** The chevron on the two controls; mirrored by the caller for the back button. */
function JournalChevron() {
  return (
    <svg viewBox="0 0 10 10" aria-hidden="true" className="h-2.5 w-2.5 fill-current">
      <path d="M2 0 L8 5 L2 10 Z" />
    </svg>
  );
}

export default function Journal({ children }: { children?: ReactNode }) {
  // `Children.toArray` flattens nested arrays and iterables, drops null,
  // undefined and booleans — so `{cond && <Page/>}` disappears cleanly — and
  // re-keys what is left. It does *not* flatten fragments: a `<>…</>` is one
  // element and therefore one page.
  const pages = Children.toArray(children);
  const spreadCount = Math.max(1, Math.ceil(pages.length / 2));

  const [spread, setSpread] = useState(0);
  const [phase, setPhase] = useState<FlipPhase>('idle');

  const leafRef = useRef<HTMLDivElement | null>(null);
  const backRef = useRef<HTMLButtonElement | null>(null);
  const nextRef = useRef<HTMLButtonElement | null>(null);
  const bookId = useId();

  const forward = phase === 'forward';
  const turning = phase !== 'idle';

  const atStart = spread <= 0;
  const atEnd = spread >= spreadCount - 1;

  // Which child lands in which of the four slots. Each turning phase asks for
  // four consecutive, distinct indices, so no child is ever rendered twice.
  //
  //   slot         | idle   | forward | backward
  //   left half    | 2N     | 2N      | 2N-2
  //   right half   | 2N+1   | 2N+3    | 2N+1
  //   leaf front   | —      | 2N+1    | 2N
  //   leaf back    | —      | 2N+2    | 2N-1
  const leftIndex = phase === 'backward' ? spread * 2 - 2 : spread * 2;
  const rightIndex = forward ? spread * 2 + 3 : spread * 2 + 1;
  const frontIndex = forward ? spread * 2 + 1 : spread * 2;
  const backIndex = forward ? spread * 2 + 2 : spread * 2 - 1;

  // The front face wears the trim of the half the leaf lifts off; the back face
  // wears the trim of the half it lands on.
  const frontSide = forward ? 'right' : 'left';
  const backSide = forward ? 'left' : 'right';

  // The leaf exists only while a turn is running. That is what makes the commit
  // free: at -180° its back face is coplanar with, and directly over, the static
  // left half, so when React swaps in the new spread and unmounts the leaf the
  // pixels are identical. The same argument covers the mount at 0°.
  useEffect(() => {
    if (phase === 'idle') return;
    const leaf = leafRef.current;
    if (!leaf) return;

    const goingForward = phase === 'forward';
    const nextSpread = goingForward ? spread + 1 : spread - 1;
    const commit = () => {
      setSpread(nextSpread);
      setPhase('idle');
    };

    // anime.js writes straight to style.transform, which React never observes.
    // Re-seed the start so a node React reuses — StrictMode replays this effect
    // on the same element in dev — always begins the turn flat.
    leaf.style.transform = 'rotateY(0deg)';
    leaf.style.setProperty('--journal-leaf-lift', '0');

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      commit();
      return;
    }

    // Positive rotateY sends an element's right edge away from the viewer, so a
    // leaf hinged on its left (lifting off the right half) has to go negative
    // for its outer edge to come up toward you, and vice versa.
    const turn = animate(leaf, {
      rotateY: goingForward ? ['0deg', '-180deg'] : ['0deg', '180deg'],
      duration: TURN_DURATION,
      ease: TURN_EASE,
      onComplete: commit,
    });

    // The paper catching the light. Both the leaf's drop shadow and the shade
    // gradient across its faces are multiplied by this, and it starts and ends
    // at zero, so the leaf adds nothing at either end of the turn.
    const lift = animate(leaf, {
      '--journal-leaf-lift': [
        { to: 1, duration: TURN_DURATION / 2, ease: 'outQuad' },
        { to: 0, duration: TURN_DURATION / 2, ease: 'inQuad' },
      ],
    });

    // cancel() removes the tweens and pauses without writing to the DOM and
    // without firing onComplete, so an interrupted turn can never commit a
    // spread onto an unmounted component. revert() would restore values and
    // fight the unmount, so it is deliberately not used here.
    return () => {
      turn.cancel();
      lift.cancel();
    };
  }, [phase, spread]);

  // Reaching either cover disables the control the visitor just pressed, and a
  // disabled element cannot hold focus — the browser drops it on <body>. Hand it
  // to the other control so the keyboard path out of the book stays open.
  useEffect(() => {
    const back = backRef.current;
    const next = nextRef.current;
    if (!back || !next) return;
    if (document.activeElement === next && atEnd && !atStart) back.focus();
    else if (document.activeElement === back && atStart && spreadCount > 1) next.focus();
  }, [atStart, atEnd, spreadCount]);

  const turnTo = (direction: FlipPhase) => {
    // A second click cannot beat the first one's commit — click is a discrete
    // event, which React flushes synchronously — so the phase check is a
    // sufficient guard on its own.
    if (turning) return;
    if (direction === 'forward' && atEnd) return;
    if (direction === 'backward' && atStart) return;
    setPhase(direction);
  };

  return (
    <section aria-labelledby="journal-heading" className="flex flex-col gap-4">
      <div className="flex w-full items-center justify-center gap-[clamp(0.4rem,1.4vw,1rem)]">
        <button
          ref={backRef}
          type="button"
          onClick={() => turnTo('backward')}
          disabled={atStart}
          aria-disabled={turning || undefined}
          aria-label="Previous pages"
          aria-controls={bookId}
          className="journal-control shrink-0 rotate-180 border p-2 transition-colors duration-200"
        >
          <JournalChevron />
        </button>

        {/* The perspective lives here, in inline style: it creates a stacking
            context but *not* a 3D rendering context, so the leaf stays above the
            static halves by plain z-index with no depth sorting to fight. Adding
            transform-style: preserve-3d to this element would break exactly
            that, and it must never be clipped — with perspective the leaf's near
            edge is magnified mid-turn and overflows this box vertically. */}
        <div
          id={bookId}
          role="group"
          aria-roledescription="journal"
          aria-label="Journal pages"
          className="relative aspect-[3/2] w-full max-w-[54rem] min-w-0"
          style={{ perspective: 'clamp(760px, 150vw, 2200px)' }}
        >
          <JournalFace
            side="left"
            className="journal-stack-left absolute inset-y-0 left-0 z-10 w-1/2"
          >
            {pageAt(pages, leftIndex)}
          </JournalFace>

          <JournalFace
            side="right"
            className="journal-stack-right absolute inset-y-0 right-0 z-10 w-1/2"
          >
            {pageAt(pages, rightIndex)}
          </JournalFace>

          {turning && (
            // The only preserve-3d element in the tree, and the only one that
            // must not get overflow-hidden: any overflow other than visible
            // forces transform-style back to flat and collapses the two faces
            // into one plane. inert as well as aria-hidden, because aria-hidden
            // alone still leaves links inside the duplicated page tabbable.
            <div
              ref={leafRef}
              inert
              aria-hidden
              className={`journal-leaf absolute inset-y-0 z-30 w-1/2 [transform-style:preserve-3d] ${
                forward ? 'left-1/2 origin-left' : 'left-0 origin-right'
              }`}
              style={{ willChange: 'transform' }}
            >
              <JournalFace side={frontSide} withShade className="absolute inset-0 [backface-visibility:hidden]">
                {pageAt(pages, frontIndex)}
              </JournalFace>

              {/* Two 180° rotations compose to identity, so the back face reads
                  upright rather than mirrored once the leaf has landed. */}
              <JournalFace
                side={backSide}
                withShade
                flipped
                className="absolute inset-0 [backface-visibility:hidden]"
              >
                {pageAt(pages, backIndex)}
              </JournalFace>
            </div>
          )}

          {/* Painted above the leaf, which is what hides the seam where the
              hinge meets the pages — precisely where sub-pixel artefacts show. */}
          <div
            aria-hidden
            className="journal-spine pointer-events-none absolute inset-y-0 left-1/2 z-40 w-[clamp(10px,2vw,20px)] -translate-x-1/2"
          />
        </div>

        <button
          ref={nextRef}
          type="button"
          onClick={() => turnTo('forward')}
          disabled={atEnd}
          aria-disabled={turning || undefined}
          aria-label="Next pages"
          aria-controls={bookId}
          className="journal-control shrink-0 border p-2 transition-colors duration-200"
        >
          <JournalChevron />
        </button>
      </div>

      {/* `spread` only changes at commit, so this announces once per completed
          turn rather than chattering mid-flip. */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        Spread {spread + 1} of {spreadCount}
      </p>
    </section>
  );
}
