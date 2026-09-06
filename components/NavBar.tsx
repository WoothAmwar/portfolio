import Link from "next/link";
import { GithubLogoIcon, LinkedinLogoIcon } from "@phosphor-icons/react";


export default function NavigationBar() {
    return (
        <div className="px-[18%] py-3 backdrop-blur-[3px] font-semibold fixed top-0 left-0 z-40 navbar-text flex flex-row gap-6 w-full pb-3">
            <div className="flex-initial">
                <Link href="/">Anwar Kader</Link>
            </div>
            <div className="grow"></div>

            <div className="flex gap-4">
                <Link className="basis-sm" href="/info#about">About</Link>
                <Link href="/info#experience">Experience</Link>
                <Link href="/info#projects">Projects</Link>
                <Link href="/resume" target="_blank" rel="noopener noreferrer">Resume</Link>
            </div>

            <div className="flex gap-2 items-end">
                <Link href="https://www.linkedin.com/in/anwar-kader/" target="_blank" rel="noopener noreferrer"><LinkedinLogoIcon size={28} /></Link>
                <Link href="https://github.com/WoothAmwar" target="_blank" rel="noopener noreferrer"><GithubLogoIcon size={28}/></Link>
            </div>
        </div>
    );
}