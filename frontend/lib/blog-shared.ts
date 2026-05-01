export const BLOG_BASE_PATH = "/blog";
export const SITE_URL = "https://heyhomie.fun";

const DEFAULT_ACCENT = "#00F666";
const CATEGORY_ACCENTS: Record<string, string> = {
  Updates: "#00F666",
  Ethos: "#F4F4F0",
  Education: "#F8B86B",
  Research: "#A78BFA",
  Product: "#60A5FA",
};

export function postUrl(slug: string): string {
  return `${BLOG_BASE_PATH}/${slug}`;
}

export function absolutePostUrl(slug: string): string {
  return `${SITE_URL}${postUrl(slug)}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d
    .toLocaleDateString("en-US", { month: "short", day: "numeric" })
    .toUpperCase();
}

export function categoryAccent(category: string): string {
  return CATEGORY_ACCENTS[category] ?? DEFAULT_ACCENT;
}

export { CATEGORY_ACCENTS, DEFAULT_ACCENT };
