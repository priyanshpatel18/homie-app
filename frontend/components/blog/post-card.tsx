import Link from "next/link";
import type { CSSProperties } from "react";

import { CoverArt } from "@/components/blog/cover-art";
import { formatShortDate, postUrl } from "@/lib/blog-shared";
import { cn } from "@/lib/utils";

export type PostCardData = {
  slug: string;
  title: string;
  description: string;
  date: string;
  category: string;
  cover?: string;
  coverAccent: string;
};

export function PostCard({
  post,
  className,
}: {
  post: PostCardData;
  className?: string;
}) {
  return (
    <article
      className={cn("group", className)}
      style={{ "--accent": post.coverAccent } as CSSProperties}
    >
      <Link
        href={postUrl(post.slug)}
        className="block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-4 focus-visible:ring-offset-[#040405]"
      >
        <CoverArt
          title={post.title}
          category={post.category}
          accent={post.coverAccent}
          cover={post.cover}
          size="sm"
          className="transition-[transform,border-color] duration-300 ease-out group-hover:-translate-y-0.5 group-hover:border-white/[0.12]"
        />

        <div className="mt-4 flex items-center justify-between">
          <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-white/65">
            {post.category}
          </span>
          <time
            dateTime={post.date}
            className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/40"
          >
            {formatShortDate(post.date)}
          </time>
        </div>

        <h3 className="mt-3 text-[1.15rem] font-medium leading-snug tracking-[-0.01em] text-white transition-colors group-hover:text-[var(--accent)]">
          {post.title}
        </h3>

        {post.description && (
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/55">
            {post.description}
          </p>
        )}
      </Link>
    </article>
  );
}
