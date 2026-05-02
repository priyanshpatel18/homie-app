"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type TocItem = { depth: 2 | 3; id: string; text: string };

export function Toc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    if (items.length === 0 || typeof window === "undefined") return;

    const elements = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target?.id) {
          setActive(visible[0].target.id);
        }
      },
      {
        rootMargin: "-96px 0px -65% 0px",
        threshold: [0, 1],
      }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  return (
    <nav aria-label="Table of contents" className="text-sm">
      <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
        On this page
      </p>
      <ul className="space-y-2.5 border-l border-white/[0.06] pl-4">
        {items.map((item) => {
          const isActive = item.id === active;
          return (
            <li
              key={item.id}
              className={cn(
                item.depth === 3 && "pl-3",
                "leading-snug"
              )}
            >
              <a
                href={`#${item.id}`}
                className={cn(
                  "block transition-colors",
                  isActive
                    ? "text-[#00F666]"
                    : "text-white/55 hover:text-white"
                )}
              >
                {item.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
