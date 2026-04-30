/**
 * News Search — fetches real news with actual content snippets.
 *
 * Sources (all free, no API key):
 *  1. Google News RSS   — broad coverage, reliable
 *  2. CoinDesk RSS      — crypto-specific editorial
 *  3. CoinTelegraph RSS — crypto news
 *  4. Decrypt RSS       — crypto editorial
 *  5. CryptoPanic API   — optional, structured + sentiment votes (set CRYPTOPANIC_API_KEY)
 */

// ─── RSS sources ─────────────────────────────────────────────────────────────
const RSS_FEEDS = [
  { name: "CoinDesk",      url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { name: "CoinTelegraph", url: "https://cointelegraph.com/rss" },
  { name: "Decrypt",       url: "https://decrypt.co/feed" },
  { name: "The Block",     url: "https://www.theblock.co/rss.xml" },
];

// ─── Parse RSS XML → array of { title, snippet, source, publishedAt } ────────
function parseRss(xml, sourceName, limit = 8) {
  const items = [];

  // Split into <item> blocks
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let itemMatch;

  while ((itemMatch = itemRe.exec(xml)) !== null && items.length < limit) {
    const block = itemMatch[1];

    const title   = extractTag(block, "title");
    const desc    = extractTag(block, "description") ||
                    extractTag(block, "content:encoded") ||
                    extractTag(block, "summary");
    const pubDate = extractTag(block, "pubDate") || extractTag(block, "dc:date");

    if (!title) continue;

    // Clean description — strip HTML, truncate to ~200 chars
    const snippet = cleanText(desc, 220);

    // Skip generic feed titles (no useful content)
    if (title.length < 10 || title.toLowerCase().includes("feed") || title.toLowerCase() === sourceName.toLowerCase()) continue;

    items.push({
      title,
      snippet: snippet || title,
      source: sourceName,
      publishedAt: pubDate ? new Date(pubDate).toLocaleDateString() : null,
    });
  }

  return items;
}

function extractTag(text, tag) {
  // Handles both <tag>content</tag> and <![CDATA[...]]>
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i");
  const m  = re.exec(text);
  return m ? m[1].trim() : null;
}

function cleanText(raw, maxLen) {
  if (!raw) return "";
  return raw
    .replace(/<[^>]+>/g, " ")       // strip HTML tags
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen)
    + (raw.length > maxLen ? "…" : "");
}

// ─── Google News RSS (best for any topic query) ───────────────────────────────
async function fetchGoogleNews(query, limit = 6) {
  try {
    const q   = encodeURIComponent(query);
    const url = `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Homie/1.0)" },
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRss(xml, "Google News", limit);
  } catch {
    return [];
  }
}

// ─── Fetch a single RSS feed ──────────────────────────────────────────────────
async function fetchRssFeed({ name, url }, query, limit = 4) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Homie/1.0)" },
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return [];
    const xml   = await res.text();
    const items = parseRss(xml, name, 20);
    const q     = query.toLowerCase();

    // Filter to items that mention the query keywords
    const terms = q.split(/\s+/).filter((t) => t.length > 2);
    const relevant = items.filter((item) =>
      terms.some(
        (t) =>
          item.title.toLowerCase().includes(t) ||
          item.snippet.toLowerCase().includes(t)
      )
    );

    return relevant.slice(0, limit);
  } catch {
    return [];
  }
}

// ─── CryptoPanic (optional, free tier) ───────────────────────────────────────
async function fetchCryptoPanic(query, limit = 5) {
  const key = process.env.CRYPTOPANIC_API_KEY;
  if (!key) return [];
  try {
    // Extract currency symbols from query (e.g. "SOL BTC ETH")
    const currencyMatch = query.toUpperCase().match(/\b(SOL|BTC|ETH|BONK|JUP|WIF|RAY|PYTH|ORCA|USDC)\b/g);
    const currencies    = currencyMatch ? currencyMatch.slice(0, 3).join(",") : "SOL";
    const res = await fetch(
      `https://cryptopanic.com/api/v1/posts/?auth_token=${key}&currencies=${currencies}&kind=news&public=true`,
      { signal: AbortSignal.timeout(6_000) }
    );
    if (!res.ok) return [];
    const json = await res.json() as any;
    return (json?.results ?? []).slice(0, limit).map((p) => ({
      title:       p.title,
      snippet:     p.title, // CryptoPanic doesn't include body in free tier
      source:      p.source?.title || "CryptoPanic",
      publishedAt: p.published_at ? new Date(p.published_at).toLocaleDateString() : null,
      votes:       p.votes ? `+${p.votes.positive || 0} / -${p.votes.negative || 0}` : null,
    }));
  } catch {
    return [];
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────
/**
 * Search for news related to a query.
 * Returns structured results the LLM can reason over.
 *
 * @param {string} query
 * @param {number} maxResults
 */
async function searchNews(query, maxResults = 8) {
  // Fetch Google News + two crypto RSS feeds + CryptoPanic in parallel
  const [googleItems, cpItems, ...rssResults] = await Promise.all([
    fetchGoogleNews(query, 6),
    fetchCryptoPanic(query, 4),
    ...RSS_FEEDS.slice(0, 2).map((feed) => fetchRssFeed(feed, query, 3)),
  ]);

  // Merge and deduplicate by title
  const seen   = new Set();
  const merged = [];
  for (const item of [...googleItems, ...cpItems, ...rssResults.flat()]) {
    const key = item.title.slice(0, 60).toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
    if (merged.length >= maxResults) break;
  }

  return {
    query,
    resultCount: merged.length,
    results:     merged,
    source:      "Google News + CoinDesk + CoinTelegraph" + (process.env.CRYPTOPANIC_API_KEY ? " + CryptoPanic" : ""),
    note:        merged.length > 0
      ? "Summarize the key developments from these real news snippets. Quote specific facts, prices, or events when mentioned."
      : "No recent news found. Rely on on-chain market data for your response.",
  };
}

export { searchNews };