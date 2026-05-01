"use client";

import { useMemo, useState } from "react";

import { PostCard, type PostCardData } from "@/components/blog/post-card";
import { cn } from "@/lib/utils";

type PostGridProps = {
  posts: PostCardData[];
  categories: string[];
};

const ALL = "All";

export function PostGrid({ posts, categories }: PostGridProps) {
  const [active, setActive] = useState<string>(ALL);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return posts.filter((p) => {
      const inCategory = active === ALL || p.category === active;
      if (!inCategory) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      );
    });
  }, [posts, active, query]);

  const chips = [ALL, ...categories];

  return (
    <section aria-label="All posts" className="mt-10">
      <div className="flex flex-col items-stretch gap-4 lg:flex-row lg:items-center lg:justify-between">
        <label className="relative block w-full max-w-md">
          <span className="sr-only">Search posts</span>
          <span
            aria-hidden
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/35"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="20" y1="20" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            type="search"
            placeholder="Search posts"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-11 w-full rounded-full border border-white/[0.07] bg-white/[0.03] pl-10 pr-4 text-sm text-white placeholder:text-white/35 outline-none transition-colors focus:border-[#00F666]/40 focus:bg-white/[0.05]"
          />
        </label>

        <div
          role="tablist"
          aria-label="Filter by category"
          className="flex flex-wrap items-center gap-2"
        >
          {chips.map((c) => {
            const isActive = c === active;
            return (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(c)}
                className={cn(
                  "h-9 rounded-full border px-4 text-xs font-medium tracking-tight transition-colors",
                  isActive
                    ? "border-transparent bg-[#00F666] text-[#040405]"
                    : "border-white/[0.08] bg-transparent text-white/70 hover:border-white/[0.18] hover:text-white"
                )}
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-16 text-center text-sm text-white/55">
          No posts match that filter yet.
        </p>
      ) : (
        <ul className="mt-10 grid grid-cols-1 gap-x-6 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((post) => (
            <li key={post.slug}>
              <PostCard post={post} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
