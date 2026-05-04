// Convert a GitHub PR body (CommonMark) into Telegram-flavoured HTML and POST
// it to sendMessage. Telegram only accepts a tiny tag set:
//   <b> <i> <u> <s> <a href> <code> <pre> <blockquote>
// We map every markdown block onto those, plus literal bullet/checkbox chars.
//
// Inputs (all via env, set by the workflow):
//   TELEGRAM_BOT_TOKEN   bot HTTP API token
//   TELEGRAM_CHAT_ID     destination chat
//   TELEGRAM_THREAD_ID   optional forum thread
//   LABEL                "PULL REQUEST" | "MERGED" | "PR CLOSED"
//   NUM, ACTOR, REPO, HEAD, BASE, TITLE, BODY, URL

import MarkdownIt from "markdown-it";

const TELEGRAM_LIMIT = 4096;

const env = (k) => process.env[k] ?? "";
const escHtml = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ─── markdown-it renderer overrides ──────────────────────────────────────────

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  typographer: false,
});

// Headers → bold lines (Telegram has no <h*>).
md.renderer.rules.heading_open = () => "<b>";
md.renderer.rules.heading_close = () => "</b>\n";

// Paragraphs → just a trailing newline.
md.renderer.rules.paragraph_open = () => "";
md.renderer.rules.paragraph_close = () => "\n";

// Bullet & ordered lists: emit literal markers per item.
md.renderer.rules.bullet_list_open = () => "";
md.renderer.rules.bullet_list_close = () => "\n";
md.renderer.rules.ordered_list_open = (tokens, idx, opts, env) => {
  env._olCounters = env._olCounters || [];
  env._olCounters.push(1);
  return "";
};
md.renderer.rules.ordered_list_close = (tokens, idx, opts, env) => {
  env._olCounters?.pop();
  return "\n";
};

md.renderer.rules.list_item_open = (tokens, idx, opts, env) => {
  // Determine nesting depth by counting open list tokens above us.
  let depth = 0;
  for (let i = 0; i < idx; i++) {
    const t = tokens[i];
    if (t.type === "bullet_list_open" || t.type === "ordered_list_open") depth++;
    if (t.type === "bullet_list_close" || t.type === "ordered_list_close") depth--;
  }
  const indent = depth > 1 ? "   ".repeat(depth - 1) : "";

  // Detect ordered list and use a number.
  // Walk backwards to find the nearest unmatched list_open.
  let isOrdered = false;
  let bal = 0;
  for (let i = idx - 1; i >= 0; i--) {
    const t = tokens[i];
    if (t.type === "list_item_close") bal++;
    if (t.type === "list_item_open") bal--;
    if (t.type === "ordered_list_open" || t.type === "bullet_list_open") {
      if (bal <= 0) {
        isOrdered = t.type === "ordered_list_open";
        break;
      }
      bal++;
    }
    if (t.type === "ordered_list_close" || t.type === "bullet_list_close") bal--;
  }

  if (isOrdered) {
    const n = (env._olCounters?.[env._olCounters.length - 1]) ?? 1;
    env._olCounters[env._olCounters.length - 1] = n + 1;
    return `${indent}${n}. `;
  }
  return `${indent}${depth >= 2 ? "◦" : "•"} `;
};
md.renderer.rules.list_item_close = () => "";

// Inline code & fenced code → <code> / <pre>.
md.renderer.rules.code_inline = (tokens, idx) =>
  `<code>${escHtml(tokens[idx].content)}</code>`;
md.renderer.rules.code_block = (tokens, idx) =>
  `<pre>${escHtml(tokens[idx].content)}</pre>\n`;
md.renderer.rules.fence = (tokens, idx) => {
  const tok = tokens[idx];
  const lang = (tok.info || "").trim().split(/\s+/)[0];
  const content = escHtml(tok.content.replace(/\n$/, ""));
  return lang
    ? `<pre><code class="language-${escHtml(lang)}">${content}</code></pre>\n`
    : `<pre>${content}</pre>\n`;
};

// Emphasis.
md.renderer.rules.strong_open = () => "<b>";
md.renderer.rules.strong_close = () => "</b>";
md.renderer.rules.em_open = () => "<i>";
md.renderer.rules.em_close = () => "</i>";
md.renderer.rules.s_open = () => "<s>";
md.renderer.rules.s_close = () => "</s>";

// Links — escape the href.
md.renderer.rules.link_open = (tokens, idx) => {
  const href = tokens[idx].attrGet("href") || "";
  return `<a href="${escHtml(href)}">`;
};
md.renderer.rules.link_close = () => "</a>";

// Blockquotes (Telegram supports <blockquote>).
md.renderer.rules.blockquote_open = () => "<blockquote>";
md.renderer.rules.blockquote_close = () => "</blockquote>\n";

// Horizontal rule → divider line.
md.renderer.rules.hr = () => "────────\n";

// Hard break → newline; soft break → space (matches GitHub rendering).
md.renderer.rules.hardbreak = () => "\n";
md.renderer.rules.softbreak = () => "\n";

// Strip image markdown (Telegram won't render inline images in text mode).
md.renderer.rules.image = (tokens, idx) => {
  const alt = tokens[idx].content || "image";
  const src = tokens[idx].attrGet("src") || "";
  return src ? `<a href="${escHtml(src)}">[${escHtml(alt)}]</a>` : `[${escHtml(alt)}]`;
};

// Tables: render rows as plain text. Telegram tables don't exist.
md.renderer.rules.table_open = () => "";
md.renderer.rules.table_close = () => "\n";
md.renderer.rules.thead_open = () => "";
md.renderer.rules.thead_close = () => "";
md.renderer.rules.tbody_open = () => "";
md.renderer.rules.tbody_close = () => "";
md.renderer.rules.tr_open = () => "";
md.renderer.rules.tr_close = () => "\n";
md.renderer.rules.th_open = () => "<b>";
md.renderer.rules.th_close = () => "</b>  ";
md.renderer.rules.td_open = () => "";
md.renderer.rules.td_close = () => "  ";

// ─── Post-processing ─────────────────────────────────────────────────────────

function renderMarkdown(src) {
  if (!src) return "";

  // Task lists: rewrite to literal checkboxes BEFORE parsing so the bullet
  // dispatch keeps working.
  const prepped = src
    .replace(/^([ \t]*)[-*][ \t]+\[[ ]\][ \t]+/gm, "$1• ☐ ")
    .replace(/^([ \t]*)[-*][ \t]+\[[xX]\][ \t]+/gm, "$1• ☑ ");

  let html = md.render(prepped, {});

  // markdown-it leaves trailing newlines and double blanks; collapse.
  html = html.replace(/\n{3,}/g, "\n\n").trim();

  // Our list_item_open already prepended "• " for the first line, so undo the
  // double prefix from the task-list rewrite.
  html = html.replace(/^(•|◦|\d+\.)\s•\s/gm, "$1 ");

  return html;
}

// ─── Body length safety ──────────────────────────────────────────────────────

function safeTruncate(text, max) {
  if (text.length <= max) return text;
  // Cut at the nearest preceding newline so we don't slice an HTML tag.
  const slice = text.slice(0, max);
  const cut = slice.lastIndexOf("\n");
  return (cut > max * 0.5 ? slice.slice(0, cut) : slice) + "\n…";
}

// ─── Build & send ────────────────────────────────────────────────────────────

async function main() {
  const token = env("TELEGRAM_BOT_TOKEN");
  const chat = env("TELEGRAM_CHAT_ID");
  if (!token || !chat) {
    throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required");
  }

  const label = env("LABEL") || "EVENT";
  const num = env("NUM");
  const actor = env("ACTOR");
  const repo = env("REPO");
  const head = env("HEAD");
  const base = env("BASE");
  const title = env("TITLE");
  const url = env("URL");
  const body = env("BODY");

  const header =
    `<b>${escHtml(label)}</b> · #${escHtml(num)} · ${escHtml(actor)}\n` +
    `<i>${escHtml(repo)}</i> · <code>${escHtml(head)}</code> → <code>${escHtml(base)}</code>\n\n` +
    `<b>${escHtml(title)}</b>\n\n`;

  const footer = `\n\n<a href="${escHtml(url)}">View PR</a>`;

  const renderedBody = renderMarkdown(body) || "<i>(no description)</i>";

  // Reserve room for header + footer; truncate the body safely.
  const reserve = header.length + footer.length + 16;
  const room = TELEGRAM_LIMIT - reserve;
  const safeBody = safeTruncate(renderedBody, Math.max(500, room));

  const text = header + safeBody + footer;

  const params = new URLSearchParams({
    chat_id: chat,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: "true",
  });
  const thread = env("TELEGRAM_THREAD_ID");
  if (thread) params.set("message_thread_id", thread);

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Telegram API ${res.status}: ${detail}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
