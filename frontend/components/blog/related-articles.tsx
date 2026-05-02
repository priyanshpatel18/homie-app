import { PostCard, type PostCardData } from "@/components/blog/post-card";
import { getAllPosts } from "@/lib/blog";

const MAX_RELATED = 3;

function pickRelated(
  all: Awaited<ReturnType<typeof getAllPosts>>,
  currentSlug: string,
  currentCategory: string
): PostCardData[] {
  const others = all.filter((p) => p.slug !== currentSlug);

  const sameCategory: typeof others = [];
  const rest: typeof others = [];
  for (const p of others) {
    if (p.category === currentCategory) sameCategory.push(p);
    else rest.push(p);
  }

  const ordered = [...sameCategory, ...rest].slice(0, MAX_RELATED);

  return ordered.map((p) => ({
    slug: p.slug,
    title: p.title,
    description: p.description,
    date: p.date,
    category: p.category,
    cover: p.cover,
    coverAccent: p.coverAccent,
  }));
}

export async function RelatedArticles({
  currentSlug,
  currentCategory,
}: {
  currentSlug: string;
  currentCategory: string;
}) {
  const all = await getAllPosts();
  const related = pickRelated(all, currentSlug, currentCategory);

  if (related.length === 0) return null;

  return (
    <section
      aria-labelledby="related-articles-heading"
      className="mx-auto w-full max-w-[1280px] px-5 pt-20 sm:px-8 sm:pt-24"
    >
      <h2
        id="related-articles-heading"
        className="text-[clamp(1.6rem,3.4vw,2.4rem)] font-medium leading-tight tracking-[-0.02em] text-white"
      >
        Related Articles
      </h2>

      <ul className="mt-8 grid grid-cols-1 gap-x-6 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
        {related.map((post) => (
          <li key={post.slug}>
            <PostCard post={post} />
          </li>
        ))}
      </ul>
    </section>
  );
}
