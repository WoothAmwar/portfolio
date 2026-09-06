'use client';

import { animate, stagger } from 'animejs';
import { useEffect, useRef, useState, type Ref } from 'react';

type ExperienceEntry = {
  id: string;
  /** Short label used on the nav chip; the card header shows the full name. */
  companyLogoRoute: string;
  org: string;
  role: string;
  location: string;
  start: string;
  end: string;
  bullets: string[];
};

const EXPERIENCES: ExperienceEntry[] = [
  {
    id: 'infleqtion',
    companyLogoRoute: '/Infleqtion_Logo_Full_Color_RGB.png',
    org: 'Infleqtion',
    role: 'Software Engineer Intern',
    location: 'Chicago, Illinois',
    start: 'June 2026',
    end: 'August 2026',
    bullets: [
      'Led development of a React/TypeScript dashboard for a critical quantum-computing cloud platform used by 100+ customers and internal employees, owning the API integration layer end-to-end',
      'Implemented OAuth authentication using HTTP cookie exchange to secure sessions and prevent unauthorized access',
      'Cut redundant API calls by over 60% with a custom client-side caching layer over Redis to minimize network traffic',
      'Authored an 80+ test Vitest suite for the API layer, combining mocked and live-server tests to validate authentication, token handling, and error paths using GitHub Actions and CI/CD',
    ],
  },
  {
    id: 'rcc-dvl',
    companyLogoRoute: '/rcc_logo.png',
    org: "Research Computing Center",
    role: 'Visualization Software Engineer Intern',
    location: 'Chicago, Illinois',
    start: 'September 2025',
    end: 'May 2026',
    bullets: [
      'Optimized system performance by reducing application load time by over 95% (20 minutes to 40 seconds) through object pooling, efficient memory management, and minimizing costly instantiations of 3D objects.',
      'Extracted data from large NetCDF4 global climate datasets (40+ GB) using Python (XArray, Pandas), converting 10+ atmospheric variables into optimized formats for 3D visualization.',
      "Presented application to NASA scientists and over 15 computational scientists, including the center's director",
    ],
  },
  {
    id: 'supergroup',
    companyLogoRoute: '/supergroup_logo.png',
    org: 'SUPERgroup Research Collective',
    role: 'Research Assistant Intern',
    location: 'Chicago, Illinois',
    start: 'April 2025',
    end: 'December 2025',
    bullets: [
      'Greenfield development of an application that integrated with Anthropic Claude LLM API to display automatically redacted PII, supporting an ongoing PhD research project on privacy and security where I am a co-author on 1 paper.',
      'Improved performance and decreased retrieval latency by 50% by redesigning the UI and backend from the ground-up',
      'Developed an automated pipeline in Python to assist in labeling and analyzing over 1,000 data entries from a dataset of 3,000+, collapsing multiple 2hr+ manual rounds of review into single 2-minute runs while maintaining data integrity.',
    ],
  },
];

function ExperienceCard({
  exp,
  defaultOpen,
  ref,
}: {
  exp: ExperienceEntry;
  defaultOpen: boolean;
  ref?: Ref<HTMLDivElement>;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // The card is swapped by changing its `key`, so every selection is a fresh
  // mount — it has to fade itself in here rather than rely on a one-time
  // parent effect, which would only ever catch whichever card was first.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.style.opacity = '1';
      return;
    }
    animate(el, {
      opacity: [0, 1],
      duration: 500,
    });
  }, []);

  return (
    <div
      ref={(el) => {
        rootRef.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
      }}
      className="experience-card border p-5 opacity-0"
    >
      <div className="flex items-center gap-3">
        <h3 className="experience-heading text-lg font-semibold">{exp.org}</h3>
      </div>

      <hr className="experience-divider my-3 border-t" />

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="experience-heading text-base font-medium">
          {exp.role}
        </div>
        <div className="experience-date text-sm font-medium whitespace-nowrap">
          {/* {exp.location} &nbsp;|&nbsp;  */}
          {exp.start} &rarr; {exp.end}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="experience-toggle mt-3 flex items-center gap-1.5 text-sm font-semibold transition-colors duration-200"
      >
        <svg
          viewBox="0 0 10 10"
          aria-hidden="true"
          className={`h-2.5 w-2.5 fill-current transition-transform duration-300 ${open ? 'rotate-0' : '-rotate-90'}`}
        >
          <path d="M0 2 L5 8 L10 2 Z" />
        </svg>
        Details
      </button>

      {open && (
        <ul className="experience-bullets mt-2.5 list-disc space-y-1.5 pl-5 text-sm leading-6">
          {exp.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ExperienceSection() {
  const introRef = useRef<HTMLParagraphElement | null>(null);
  const chipRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [currentOpenCard, setOpenCardIndex] = useState<number>(0);

  useEffect(() => {
    const chips = chipRefs.current.filter((el): el is HTMLButtonElement => el !== null);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const el of [...chips]) el.style.opacity = '1';
      return;
    }

    animate(chips, {
      opacity: [0, 1],
      translateY: ['0.5em', '0em'],
      duration: 500,
      delay: stagger(60, { start: 300 }),
      ease: 'outQuad',
    });
  }, []);

  const jumpTo = (index: number) => {
    setOpenCardIndex(index);
    const card = cardRefs.current[index];
    if (!card) return;
    // const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // card.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    // if (reduceMotion) return;
    animate(card, {
      keyframes: [
        { borderColor: 'var(--color-highlight-flash-border)', duration: 260 },
        { borderColor: 'var(--color-highlight-settle-border)', duration: 620 },
      ],
      ease: 'outQuad',
    });
  };

  return (
    <section
      id="experience"
      aria-labelledby="experience-heading"
      className="flex flex-col gap-6"
    >
      <div className="flex flex-wrap gap-2.5">
        {EXPERIENCES.map((exp, i) => (
          <button
            key={exp.id}
            ref={(el) => {
              chipRefs.current[i] = el;
            }}
            type="button"
            onClick={() => jumpTo(i)}
            className="experience-chip flex items-center gap-2 border px-3 py-1.5 text-sm font-medium opacity-0 transition-colors duration-200"
          >
            <span className="experience-badge flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold">
              <img src={`${exp.companyLogoRoute}`}  width="50" height="50"/>
            </span>
            {exp.org}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-5">
        {/* {EXPERIENCES.map((exp, i) => (
          <ExperienceCard
            key={exp.id}
            ref={(el) => {
              cardRefs.current[i] = el;
            }}
            exp={exp}
            defaultOpen={i === 0}
          />
        ))} */}
        <ExperienceCard 
          key={EXPERIENCES[currentOpenCard].id}
          ref={(el) => {cardRefs.current[currentOpenCard] = el;}}
          exp={EXPERIENCES[currentOpenCard]}
          defaultOpen={true}
        />
      </div>
    </section>
  );
}
