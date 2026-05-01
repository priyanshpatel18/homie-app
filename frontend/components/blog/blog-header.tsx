import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

type Active = "blog" | "ask";

export function BlogHeader({ active }: { active?: Active }) {
  return (
    <header className="relative z-10">
      <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between px-5 py-5 sm:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F666] focus-visible:ring-offset-2 focus-visible:ring-offset-[#040405]"
          aria-label="HeyHomieAI home"
        >
          <span className="relative inline-block size-6">
            <Image
              src="/homie/mainlogo.svg"
              alt=""
              fill
              priority
              className="object-contain"
            />
          </span>
          <span className="text-sm font-medium tracking-tight text-white/90">
            HeyHomieAI
          </span>
        </Link>

        <nav aria-label="Primary" className="flex items-center gap-6">
          <Link
            href="/chat"
            aria-current={active === "ask" ? "page" : undefined}
            className={cn(
              "hh-link text-sm hover:text-white",
              active === "ask" ? "text-white/95" : "text-white/75"
            )}
          >
            Ask
          </Link>
          <Link
            href="/blog"
            aria-current={active === "blog" ? "page" : undefined}
            className={cn(
              "hh-link text-sm hover:text-white",
              active === "blog" ? "text-white/95" : "text-white/75"
            )}
          >
            Blog
          </Link>
          <a
            href="https://x.com/HeyHomieAI"
            target="_blank"
            rel="noreferrer"
            className="hh-link text-sm text-white/75 hover:text-white"
          >
            @HeyHomieAI
          </a>
        </nav>
      </div>
    </header>
  );
}
