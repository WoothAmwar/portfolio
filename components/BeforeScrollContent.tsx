'use client';

import { animate } from 'animejs';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * A down arrow drawn on a 5 x 7 grid of small squares: a shaft down the middle
 * and a solid triangular head. The head is filled rather than a pair of
 * chevron arms, which with gaps this size would read as a cross rather than an
 * arrow. Cells are [row, column], both 1-indexed to match CSS grid.
 */
const ARROW_CELLS: Array<[row: number, column: number]> = [
  [1, 3],
  [2,2],
  [2,4],
  [2, 3],
  [3, 3],
  [4, 3],

  [5,3],
  [6,3],

  [7, 1],
  [7, 2],
  [7, 3],
  [7, 4],
  [7, 5],
  [8, 2],
  [8, 3],
  [8, 4],
  [9, 3],
];

const ARROW_ROWS = 9;
const ARROW_COLUMNS = 5;
const SQUARE_PX = 5;
const SQUARE_GAP_PX = 3;
/** How far the page must move before the hint has served its purpose. */
const DISMISS_AFTER_PX = 12;
/** Resting opacity of a square, matched by the end of the pulse. */
const SQUARE_REST = 0.22;

export default function ScrollHint() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const arrowRef = useRef<HTMLDivElement | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const arrow = arrowRef.current;
    if (!container || !arrow) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const squares = Array.from(arrow.children) as HTMLElement[];

    if (reduceMotion) {
      container.style.opacity = '1';
    } else {
      animate(container, {
        opacity: [0, 1],
        translateY: ['0.75rem', '0rem'],
        duration: 600,
        delay: 700,
        ease: 'outQuad',
      });

      // One pulse per square, delayed by its row, so brightness travels down
      // the arrow as a wave and then starts again from the top.
      animate(squares, {
        keyframes: [
          { opacity: 1, scale: 1.35, duration: 240 },
          { opacity: SQUARE_REST, scale: 1, duration: 220 },
        ],
        // One animation, not one per row: separate animations would each loop
        // on their own cycle length and drift out of step. anime types the
        // target as its own union, so the row is read back off the element.
        delay: (target: unknown) => (Number((target as HTMLElement).dataset.row) - 1) * 90,
        ease: 'inOutSine',
        loop: true,
        loopDelay: 380,
      });
    }

    let done = false;
    const onScroll = () => {
      if (done || window.scrollY <= DISMISS_AFTER_PX) return;
      done = true;
      window.removeEventListener('scroll', onScroll);
      if (reduceMotion) {
        setDismissed(true);
        return;
      }
      animate(container, {
        opacity: 0,
        translateY: '0.75rem',
        duration: 320,
        ease: 'outQuad',
        onComplete: () => setDismissed(true),
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    // Covers a reload that restores a scrolled position.
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (dismissed) return null;

  return (
    <div ref={containerRef} style={{ opacity: 0, willChange: 'transform, opacity' }} className="z-20 fixed inset-0 pointer-events-none">
      <div className="absolute flex flex-col items-center gap-3 right-[clamp(1.25rem,3vw,3rem)] bottom-[clamp(0.75rem,3vh,2.5rem)]">
        <span className="text-[0.7rem] font-medium tracking-[0.24em] uppercase opacity-70">
          Scroll down
        </span>

        <div
          ref={arrowRef}
          aria-hidden
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${ARROW_COLUMNS}, ${SQUARE_PX}px)`,
            gridTemplateRows: `repeat(${ARROW_ROWS}, ${SQUARE_PX}px)`,
            gap: `${SQUARE_GAP_PX}px`,
          }}
        >
          {ARROW_CELLS.map(([row, column]) => (
            <span
              key={`${row}-${column}`}
              data-row={row}
              className="bg-current"
              style={{
                gridRow: row,
                gridColumn: column,
                opacity: SQUARE_REST,
                willChange: 'transform, opacity',
              }}
            />
          ))}
        </div>
      </div>

      <div className="font-light text-sm text-gray-400 absolute left-[clamp(1.25rem,3vw,3rem)] bottom-[clamp(0.75rem,3vh,2.5rem)] pointer-events-auto">
        <div>
          <div>Background image created with custom application</div>
          <div>Used <a href="https://www.favicon.cc/?" target="_blank" rel="noopener noreferrer" className="text-blue-500">this</a> favicon drawer website</div>
        </div>
      </div>
    </div>
  );
}
