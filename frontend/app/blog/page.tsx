import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { BlogFooter } from "@/components/blog/blog-footer";
import { BlogHeader } from "@/components/blog/blog-header";
import { CoverArt } from "@/components/blog/cover-art";
import { PostGrid } from "@/components/blog/post-grid";
import { SubscribeCta } from "@/components/blog/subscribe-cta";
import {
  formatDate,
  formatShortDate,
  getAllCategories,
  getAllPosts,
  postUrl,
  SITE_URL,
} from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Notes, explainers, and product updates from HeyHomieAI — a calmer way to be on-chain.",
  alternates: {
    canonical: `${SITE_URL}/blog`,
  },
};

export default async function BlogIndexPage() {
  const [posts, categories] = await Promise.all([
    getAllPosts(),
    getAllCategories(),
  ]);

  const featured = posts[0];
  const rest = posts.slice(1);

  const cards = posts.map((p) => ({
    slug: p.slug,
    title: p.title,
    description: p.description,
    date: p.date,
    category: p.category,
    cover: p.cover,
    coverAccent: p.coverAccent,
  }));

  return (
    <div className="relative isolate flex min-h-dvh flex-1 flex-col overflow-hidden bg-[#040405] text-[#f4f4f0] selection:bg-[#00F666] selection:text-black">
      <BlogHeader active="blog" />

      <main className="relative z-10 mx-auto w-full max-w-[1280px] px-5 sm:px-8">
        <section
          aria-labelledby="blog-eyebrow"
          className="pt-12 sm:pt-16"
        >
          <p
            id="blog-eyebrow"
            className="font-serif text-[17px] italic text-white/45"
          >
            Field notes
          </p>
        </section>

        {featured && <FeaturedPost post={featured} />}

        {rest.length === 0 ? (
          <p className="mt-16 text-sm text-white/55">
            More posts on the way.
          </p>
        ) : (
          <PostGrid posts={cards} categories={categories} />
        )}
      </main>

      <SubscribeCta />

      <BlogFooter />
    </div>
  );
}

function FeaturedPost({
  post,
}: {
  post: Awaited<ReturnType<typeof getAllPosts>>[number];
}) {
  return (
    <section
      aria-label="Featured post"
      className="group relative mt-6 overflow-hidden rounded-3xl border border-white/[0.07] bg-white/[0.015] p-6 transition-colors hover:border-white/[0.12] focus-within:border-white/[0.12] sm:p-8 lg:p-10"
      style={{ "--accent": post.coverAccent } as React.CSSProperties}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 80% at 100% 0%, " +
            post.coverAccent +
            "12 0%, transparent 60%)",
        }}
      />

      <div className="grid grid-cols-12 gap-y-8 gap-x-8 lg:gap-x-12">
        <div className="col-span-12 flex flex-col lg:col-span-7">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center rounded-full border border-white/[0.1] bg-white/[0.04] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white/75">
              {post.category}
            </span>
            <span aria-hidden className="text-white/20">·</span>
            <time
              dateTime={post.date}
              className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/45"
            >
              {formatShortDate(post.date)}
            </time>
          </div>

          <h2 className="mt-6 text-[clamp(1.85rem,4vw,3rem)] font-medium leading-[1.05] tracking-[-0.02em] text-white">
            <Link
              href={postUrl(post.slug)}
              className="outline-none transition-colors before:absolute before:inset-0 before:z-10 before:rounded-3xl before:content-[''] hover:text-[var(--accent)] focus-visible:text-[var(--accent)] focus-visible:before:ring-2 focus-visible:before:ring-[var(--accent)] focus-visible:before:ring-offset-4 focus-visible:before:ring-offset-[#040405]"
            >
              {post.title}
            </Link>
          </h2>

          {post.description && (
            <p className="mt-5 max-w-xl text-[15px] leading-7 text-white/65">
              {post.description}
            </p>
          )}

          <div className="mt-auto flex items-center gap-3 pt-8">
            <span className="relative inline-flex size-7 items-center justify-center overflow-hidden rounded-full border border-white/[0.08] bg-white/[0.04]">
              <Image
                src="/homie/mainlogo.svg"
                alt=""
                width={16}
                height={16}
                className="object-contain"
              />
            </span>
            <span className="text-xs text-white/55">
              {post.author} · {formatDate(post.date)}
            </span>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-5">
          <CoverArt
            title={post.title}
            category={post.category}
            accent={post.coverAccent}
            cover={post.cover}
            size="lg"
            priority
          />
        </div>
      </div>
    </section>
  );
}

