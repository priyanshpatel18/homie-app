import Image from "next/image";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import type { Author } from "@/lib/blog";

export function AuthorCard({ authors }: { authors: Author[] }) {
  if (authors.length === 0) return null;

  return (
    <div className="flex items-center -space-x-2">
      {authors.map((a) => {
        const isLogo = a.avatar.endsWith(".svg");
        return (
        <HoverCard key={a.key}>
          <HoverCardTrigger
            delay={120}
            closeDelay={120}
            render={
              <button
                type="button"
                aria-label={a.name}
                className="relative size-9 overflow-hidden rounded-full border border-[#040405] bg-[#0a0a0c] outline-none ring-0 transition-transform hover:z-10 hover:scale-105 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-[#00F666]"
              >
                <Image
                  src={a.avatar}
                  alt=""
                  fill
                  sizes="36px"
                  className={
                    isLogo
                      ? "scale-[0.62] object-contain"
                      : "object-cover"
                  }
                />
              </button>
            }
          />
          <HoverCardContent
            side="bottom"
            sideOffset={10}
            className="w-[300px] border border-white/[0.08] bg-[#0a0a0c]/95 p-4 backdrop-blur"
          >
            <div className="flex items-center gap-3.5">
              <span className="relative inline-block size-12 shrink-0 overflow-hidden rounded-full border border-white/[0.08] bg-[#0a0a0c]">
                <Image
                  src={a.avatar}
                  alt=""
                  fill
                  sizes="48px"
                  className={
                    isLogo
                      ? "scale-[0.62] object-contain"
                      : "object-cover"
                  }
                />
              </span>
              <div className="min-w-0">
                <div className="truncate text-[15px] font-medium leading-tight text-white">
                  {a.name}
                </div>
                <div className="mt-1 truncate font-mono text-[12px] leading-tight text-white/55">
                  {a.role}
                </div>
              </div>
            </div>

            {(a.x || a.linkedin) && (
              <div className="mt-3.5 flex items-center gap-3">
                {a.x && (
                  <a
                    href={a.x}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${a.name} on X`}
                    className="text-white/55 transition-colors hover:text-white"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden
                    >
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </a>
                )}
                {a.linkedin && (
                  <a
                    href={a.linkedin}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${a.name} on LinkedIn`}
                    className="text-white/55 transition-colors hover:text-white"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden
                    >
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.852 3.37-1.852 3.601 0 4.268 2.37 4.268 5.455v6.288zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0z" />
                    </svg>
                  </a>
                )}
              </div>
            )}
          </HoverCardContent>
        </HoverCard>
        );
      })}
    </div>
  );
}
