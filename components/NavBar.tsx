import Link from "next/link";

export default function NavigationBar() {
    return (
        <div className="px-[18%] py-3 backdrop-blur-[3px] font-semibold fixed top-0 left-0 z-40 navbar-text flex flex-row w-full pb-3">
            <div className="flex-initial">
                <Link href="/">Anwar Kader</Link>
            </div>
            <div className="grow"></div>

            <div className="flex gap-4 items-end">
                <Link className="basis-sm" href="/info#about">About</Link>
                <Link href="/info#experience">Experience</Link>
                <Link href="/info#projects">Projects</Link>
                <Link href="/resume" target="_blank" rel="noopener noreferrer">Resume</Link>
            </div>
        </div>
    );
}