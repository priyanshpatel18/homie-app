import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { Marked, marked, type Tokens } from "marked";

export const BLOG_DIR = path.join(process.cwd(), "content", "blog");
export const BLOG_BASE_PATH = "/blog";
export const SITE_URL = "https://heyhomie.fun";

export type Heading = { depth: 2 | 3; id: string; text: string };

export type Author = {
  key: string;
  name: string;
  role: string;
  avatar: string;
  x?: string;
  linkedin?: string;
};

export const AUTHORS: Record<string, Author> = {
  homie: {
    key: "homie",
    name: "HeyHomieAI",
    role: "AI companion for Solana DeFi",
    avatar: "/homie/mainlogo.svg",
    x: "https://x.com/HeyHomieAI",
    linkedin: "https://www.linkedin.com/company/heyhomieai/",
  },
  priyansh: {
    key: "priyansh",
    name: "Priyansh Patel",
    role: "Co-founder, HeyHomieAI",
    avatar: "/priyansh.jpg",
    x: "https://x.com/priyansh_ptl18",
    linkedin: "https://linkedin.priyanshpatel.com",
  },
};

export type PostMeta = {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: string;
  authors: Author[];
  category: string;
  tags: string[];
  cover?: string;
  coverAccent: string;
  readingMinutes: number;
};

export type Post = PostMeta & {
  html: string;
  raw: string;
  headings: Heading[];
};

const DEFAULT_ACCENT = "#00F666";
const CATEGORY_ACCENTS: Record<string, string> = {
  Updates: "#00F666",
  Ethos: "#F4F4F0",
  Education: "#F8B86B",
  Research: "#A78BFA",
  Product: "#60A5FA",
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function estimateReadingMinutes(raw: string): number {
  const words = raw.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

async function listMarkdownFiles(): Promise<string[]> {
  try {
    const files = await fs.readdir(BLOG_DIR);
    return files.filter((f) => f.endsWith(".md") || f.endsWith(".mdx"));
  } catch {
    return [];
  }
}

function resolveAuthors(data: Record<string, unknown>): Author[] {
  const raw = data.authors;
  if (Array.isArray(raw)) {
    const resolved: Author[] = [];
    for (const entry of raw) {
      if (typeof entry === "string") {
        const known = AUTHORS[entry];
        if (known) resolved.push(known);
      } else if (entry && typeof entry === "object") {
        const e = entry as Record<string, unknown>;
        if (typeof e.name === "string" && typeof e.role === "string") {
          resolved.push({
            key:
              typeof e.key === "string"
                ? e.key
                : slugify(e.name),
            name: e.name,
            role: e.role,
            avatar:
              typeof e.avatar === "string"
                ? e.avatar
                : "/homie/mainlogo.svg",
            x: typeof e.x === "string" ? e.x : undefined,
            linkedin:
              typeof e.linkedin === "string" ? e.linkedin : undefined,
          });
        }
      }
    }
    if (resolved.length > 0) return resolved;
  }
  if (typeof data.author === "string" && AUTHORS[data.author]) {
    return [AUTHORS[data.author]];
  }
  return [AUTHORS.homie];
}

function toMeta(
  slug: string,
  data: Record<string, unknown>,
  raw: string
): PostMeta {
  const title = typeof data.title === "string" ? data.title : slug;
  const description =
    typeof data.description === "string" ? data.description : "";
  const date = typeof data.date === "string" ? data.date : "1970-01-01";
  const authors = resolveAuthors(data);
  const author =
    typeof data.author === "string" ? data.author : authors[0].name;
  const category =
    typeof data.category === "string" && data.category.length > 0
      ? data.category
      : "Notes";
  const tags = Array.isArray(data.tags)
    ? data.tags.filter((t): t is string => typeof t === "string")
    : [];
  const cover = typeof data.cover === "string" ? data.cover : undefined;
  const coverAccent =
    typeof data.coverAccent === "string"
      ? data.coverAccent
      : CATEGORY_ACCENTS[category] ?? DEFAULT_ACCENT;
  const readingMinutes =
    typeof data.readingMinutes === "number"
      ? data.readingMinutes
      : estimateReadingMinutes(raw);

  return {
    slug,
    title,
    description,
    date,
    author,
    authors,
    category,
    tags,
    cover,
    coverAccent,
    readingMinutes,
  };
}

function extractHeadings(md: string): Heading[] {
  const tokens = marked.lexer(md);
  const out: Heading[] = [];
  for (const t of tokens) {
    if (t.type === "heading" && (t.depth === 2 || t.depth === 3)) {
      out.push({
        depth: t.depth as 2 | 3,
        id: slugify(t.text),
        text: t.text,
      });
    }
  }
  return out;
}

function renderMarkdown(md: string): string {
  const m = new Marked({ gfm: true, breaks: false });
  m.use({
    renderer: {
      heading(this: { parser: { parseInline: (t: Tokens.Heading["tokens"]) => string } }, token: Tokens.Heading): string {
        const inline = this.parser.parseInline(token.tokens);
        const id = slugify(token.text);
        return `<h${token.depth} id="${id}">${inline}</h${token.depth}>\n`;
      },
    },
  });
  return m.parse(md) as string;
}

export async function getAllPosts(): Promise<PostMeta[]> {
  const files = await listMarkdownFiles();
  const posts = await Promise.all(
    files.map(async (file) => {
      const slug = file.replace(/\.mdx?$/, "");
      const raw = await fs.readFile(path.join(BLOG_DIR, file), "utf8");
      const { data, content } = matter(raw);
      return toMeta(slug, data, content);
    })
  );

  return posts.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export async function getAllSlugs(): Promise<string[]> {
  const files = await listMarkdownFiles();
  return files.map((f) => f.replace(/\.mdx?$/, ""));
}

export async function getAllCategories(): Promise<string[]> {
  const posts = await getAllPosts();
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const p of posts) {
    if (!seen.has(p.category)) {
      seen.add(p.category);
      ordered.push(p.category);
    }
  }
  return ordered;
}

export async function getPostBySlug(slug: string): Promise<Post | null> {
  const filePath = path.join(BLOG_DIR, `${slug}.md`);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }

  const { data, content } = matter(raw);
  const meta = toMeta(slug, data, content);
  const headings = extractHeadings(content);
  const html = renderMarkdown(content);

  return { ...meta, html, raw: content, headings };
}

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
