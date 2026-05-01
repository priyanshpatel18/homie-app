import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AuthorCard } from "@/components/blog/author-card";
import { BlogFooter } from "@/components/blog/blog-footer";
import { BlogHeader } from "@/components/blog/blog-header";
import { CoverArt } from "@/components/blog/cover-art";
import { RelatedArticles } from "@/components/blog/related-articles";
import { SubscribeCta } from "@/components/blog/subscribe-cta";
import {
  absolutePostUrl,
  formatDate,
  getAllSlugs,
  getPostBySlug,
} from "@/lib/blog";

type Params = { slug: string };

export async function generateStaticParams(): Promise<Params[]> {
  const slugs = await getAllSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata(
  props: PageProps<"/blog/[slug]">
): Promise<Metadata> {
  const { slug } = await props.params;
  const post = await getPostBySlug(slug);
  if (!post) return {};

  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: absolutePostUrl(post.slug) },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      url: absolutePostUrl(post.slug),
      publishedTime: post.date,
      authors: [post.author],
      tags: post.tags,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
    },
  };
}

export default async function BlogPostPage(
  props: PageProps<"/blog/[slug]">
) {
  const { slug } = await props.params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();

  return (
    <div className="relative isolate flex min-h-dvh flex-1 flex-col overflow-hidden bg-[#040405] text-[#f4f4f0] selection:bg-[#00F666] selection:text-black">
      <BlogHeader />

      <main className="relative z-10 mx-auto w-full max-w-[1280px] flex-1 px-5 sm:px-8">
        <div className="mx-auto mt-10 w-full max-w-[920px] sm:mt-14">
          <CoverArt
            title={post.title}
            category={post.category}
            accent={post.coverAccent}
            cover={post.cover}
            size="lg"
            priority
          />
        </div>

        <div className="mx-auto mt-10 w-full max-w-[760px] text-center">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-white/45"
          >
            <Link
              href="/blog"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-white"
            >
              <span aria-hidden>←</span> Blog
            </Link>
            <span aria-hidden>/</span>
            <span style={{ color: post.coverAccent }}>{post.category}</span>
          </nav>

          <h1 className="mt-7 text-balance text-[clamp(2.1rem,5vw,3.6rem)] font-medium leading-[1.05] tracking-[-0.022em] text-white">
            {post.title}
          </h1>

          {post.description && (
            <p className="mx-auto mt-6 max-w-[60ch] text-pretty text-[16px] leading-7 text-white/60">
              {post.description}
            </p>
          )}

          <div className="mt-10 flex justify-center">
            <AuthorCard authors={post.authors} />
          </div>
        </div>

        <div className="mx-auto mt-12 grid w-full max-w-[1100px] grid-cols-12 gap-x-10">
          <div className="col-span-12 mb-6 flex items-center justify-between border-y border-white/[0.07] py-4 lg:col-span-8 lg:col-start-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/45">
              {post.readingMinutes} min read
            </span>
            <time
              dateTime={post.date}
              className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/45"
            >
              {formatDate(post.date)}
            </time>
          </div>
        </div>

        <article className="mx-auto grid w-full max-w-[1100px] grid-cols-12 gap-x-10">
          <div className="col-span-12 lg:col-span-8 lg:col-start-3">
            <div
              className="hh-prose"
              dangerouslySetInnerHTML={{ __html: post.html }}
            />

            <hr className="mt-16 border-white/10" />

            <div className="mt-8 text-sm">
              <Link
                href="/blog"
                className="hh-link text-white/65 hover:text-white"
              >
                ← Back to blog
              </Link>
            </div>
          </div>
        </article>
      </main>

      <RelatedArticles
        currentSlug={post.slug}
        currentCategory={post.category}
      />

      <SubscribeCta />

      <BlogFooter />
    </div>
  );
}
