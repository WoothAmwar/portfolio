'use client';

import { animate } from 'animejs';
import { useEffect, useRef, type Ref } from 'react';
import ExperienceSection from './Experience';
import Journal from './Journal';
import NavigationBar from './NavBar';
import Footer from './Footer';
/**
 * The screen after the reveal. It shares the card's white ground and type
 * scale, so once the card has grown to fill the viewport the two read as one
 * continuous white page and the scroll between them is the only transition.
 */
export default function MainPagePanel({ ref }: { ref?: Ref<HTMLElement> }) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    const heading = headingRef.current;
    if (!heading) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      heading.style.opacity = '1';
      return;
    }
    animate(heading, {
      opacity: [0, 1],
      translateY: ['0.5em', '0em'],
      duration: 700,
      delay: 240,
      ease: 'outQuad',
    });
  }, []);

  return (
    <section
      id="about"
      ref={ref}
      tabIndex={-1}
      aria-labelledby="mainpage-heading"
      className="grain mainpage-panel leading-7 flex flex-col gap-3 min-h-screen w-full px-[18%] py-[2rem] outline-none"
    >
      <div className="static">
        <NavigationBar />
      </div>
      <h2
        id="mainpage-heading"
        ref={headingRef}
        className="text-left font-semibold tracking-[-0.02em] text-4xl pt-4"
        // style={{ fontSize: 'clamp(1.4rem, 4.2vw, 4.6rem)', opacity: 0 }}
      >
        Who Am I
      </h2>
      <div className="mainpage-body">
        <div className="flex flex-row gap-8">
          <div className="grow text-left tracking-[-0.02em] flex flex-col gap-4">
            <div>
              Junior currently studying Computer Science and Economics at The University of Chicago
            </div>
            <div>
              Finished a summer 2026 Software Engineer internship at <span className="font-bold">Infleqtion</span>, after working as a Visualization Software Intern at the <span className="font-bold">Research Computing Center</span> department of my university during summer 2025 and my Sophomore year. I became the Lead Software Engineer at my university's ACM chapter, and work on building software and conducting research under Professor Blase Ur and his PhD students.
            </div>
            {/* <div>
              I spend most of my time writing and learning software, scrolling the Chrome News Feed and GitHub Trending Repositories, and building something for my OpenClaw agent
            </div> */}
            <div>
              When I'm not working on something, I am probably playing pickleball, reading, making random stuff out of things lying around me, or watching YouTube videos about some game or new tech product  
            </div>
          </div>
          <figure className="basis-6xl">
            <img className="mainpage-image max-w-full h-auto p-2 border-3" src="/uchicago_prettymap.png" alt="Overhead map of UChicago, made with prettymap" width={300}/>
            <figcaption>UChicago Campus From Above</figcaption>
            <figcaption className="font-light text-xs">Generated with <a className="mainpage-link underline" href="https://github.com/marceloprates/prettymaps" target="_blank" rel="noopener noreferrer">prettymaps</a> locally</figcaption>
          </figure>
        </div>

      </div>

       <hr id="experience" className="my-5"/>

       <h2 className="journal-heading text-left text-4xl font-semibold tracking-[-0.02em] pb-2">
        Experience
      </h2>

      <ExperienceSection />

      <hr id="projects" className="my-5"/>

      <h2 className="journal-heading text-left text-4xl font-semibold tracking-[-0.02em] pb-2">
        Projects
      </h2>

      <Journal>
        {/* Spread 1 */}
        <div className="flex h-full flex-col justify-center gap-3 text-center">
          <div className="journal-caption text-[clamp(0.55rem,0.9vw,0.7rem)] font-medium tracking-[0.24em] uppercase">
            Project Journal
          </div>
          <h3 className="journal-heading text-[clamp(1.1rem,2.4vw,2rem)] font-semibold tracking-[-0.02em]">
            Things I Build
          </h3>
          <hr className="journal-rule mx-auto w-1/3 border-t" />
          {/* <p className="font-light">Chicago &middot; 2024&ndash;2026</p> */}
        </div>
        <figure className="flex h-full flex-col justify-center gap-2">
          <img
            className="mainpage-image w-full border-2 p-1"
            src="/outlined-image-2.png"
            alt="Line drawing of a desk with a laptop and monitors"
          />
          <figcaption className="journal-caption text-[clamp(0.6rem,0.95vw,0.75rem)]">
            Picture of my real life room with some custom filters from Opencvjs and Imagejs applied
          </figcaption>
        </figure>

        {/* Spread 2 */}
        <figure className="flex h-full flex-col justify-center gap-2">
          <img
            className="mainpage-image h-1/2 border-2 p-1"
            src="/pure-media-runtime.png"
            alt="System diagram for my Media Viewing application"
          />
          <figcaption className="journal-caption text-[clamp(0.6rem,0.95vw,0.75rem)]">
            Architecture for my Media Viewing website
          </figcaption>
        </figure>
        <div className="flex h-full flex-col justify-center gap-3">
          <h3 className="journal-heading text-[clamp(0.9rem,1.7vw,1.35rem)] font-semibold text-blue-500">
            <a href="https://github.com/WoothAmwar/Complete-Personal-Website" target="_blank" rel="noopener noreferrer">Media Viewing Platform &rarr;</a>
          </h3>
          <hr className="journal-rule border-t" />
          <div>
            <ol className="list-disc list-inside">
              <li>
                Users assign custom tags (Entertainment, Gaming, Education, etc.) to YouTube channels to filter videos by tag
              </li>
              <li>
                Engineered an Agent Harness with AWS Bedrock and LangChain to create video playlists on demand in under 15 seconds
              </li>
              <li>
                Chose Lambda functions and MongoDB database so page loads never hit the upstream YouTube API, reducing latency by 70%, and minimized total upstream API calls due to being constrained by YouTube API quota
              </li>
            </ol>
          </div>
        </div>

        {/* Spread 3 */}
        <div className="flex h-full flex-col justify-center gap-4">
          <h3 className="journal-heading text-[clamp(0.9rem,1.7vw,1.35rem)] font-semibold">
            Places I have worked
          </h3>
          <hr className="journal-rule border-t" />
          <img className="h-auto w-2/3" src="/Infleqtion_Logo_Full_Color_RGB.png" alt="Infleqtion" />
          <img className="h-auto w-1/2" src="/rcc_logo.png" alt="Research Computing Center" />
          <img className="h-auto w-1/4" src="/supergroup_logo.png" alt="SUPERgroup Research Collective" />
        </div>
        <div className="flex h-full flex-col justify-center gap-3">
          <p className="font-light italic">More pages as I fill them in.</p>
          <a className="mainpage-link underline" href="/info#experience">
            See the long version &rarr;
          </a>
        </div>
      </Journal>

      <hr className="my-5"/>

      <Footer />
    </section>
  );
}
