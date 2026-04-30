/**
 * Fetches raw sentiment signals for a Solana token.
 *
 * Sources:
 *  - Birdeye: on-chain price/volume change (no key for overview)
 *  - StockTwits: crypto social feed, built-in bullish/bearish labels (free, no auth)
 *  - Nitter RSS: Twitter search without official API (free, tries multiple instances)
 *  - Google News RSS: broad crypto news coverage (free, no key)
 *  - CryptoPanic: structured news with votes (free tier if CRYPTOPANIC_API_KEY set)
 */

// ─── Nitter instances to try in order ───────────────────────────────────────
const NITTER_INSTANCES = [
  "nitter.privacydev.net",
  "nitter.poast.org",
  "nitter.unixfox.eu",
  "nitter.cz",
];

// ─── Tiny RSS XML parser ─────────────────────────────────────────────────────
function parseRssTitles(xml, limit = 12) {
  const titles = [];
  // Handle both CDATA-wrapped and plain titles
  const re = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/g;
  let m;
  let skipped = false;
  while ((m = re.exec(xml)) !== null && titles.length < limit) {
    // First <title> is usually the feed title — skip it
    if (!skipped) { skipped = true; continue; }
    const t = m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
    if (t) titles.push(t);
  }
  return titles;
}

// ─── Birdeye on-chain overview ───────────────────────────────────────────────
async function fetchOnChain(mint) {
  if (!mint) return null;
  try {
    const headers = { "X-Chain": "solana" };
    if (process.env.BIRDEYE_API_KEY) headers["X-API-KEY"] = process.env.BIRDEYE_API_KEY;
    const res = await fetch(
      `https://public-api.birdeye.so/defi/token_overview?address=${mint}`,
      { headers, signal: AbortSignal.timeout(6_000) }
    );
    if (!res.ok) return null;
    const json = await res.json() as any;
    const d = json?.data ?? {};
    return {
      price:          d.price          ?? null,
      priceChange24h: d.priceChange24hPercent ?? null,
      volumeChange:   d.v24hChangePercent     ?? null,
      volume24h:      d.v24hUSD              ?? null,
      marketCap:      d.mc                   ?? null,
      liquidity:      d.liquidity            ?? null,
    };
  } catch {
    return null;
  }
}

// ─── StockTwits social stream ────────────────────────────────────────────────
async function fetchStockTwits(symbol) {
  try {
    const res = await fetch(
      `https://api.stocktwits.com/api/2/streams/symbol/${symbol.toUpperCase()}.json`,
      { signal: AbortSignal.timeout(6_000) }
    );
    if (!res.ok) return null;
    const json = await res.json() as any;
    const messages = json?.messages ?? [];
    if (!messages.length) return null;

    let bullish = 0, bearish = 0, neutral = 0;
    const snippets = [];

    for (const msg of messages.slice(0, 30)) {
      const sent = msg?.entities?.sentiment?.basic;
      if (sent === "Bullish") bullish++;
      else if (sent === "Bearish") bearish++;
      else neutral++;

      const body = (msg.body || "").slice(0, 120);
      if (body) snippets.push(body);
    }

    const total = bullish + bearish + neutral || 1;
    return {
      bullishPct:   Math.round((bullish / total) * 100),
      bearishPct:   Math.round((bearish / total) * 100),
      messageCount: messages.length,
      snippets:     snippets.slice(0, 5),
    };
  } catch {
    return null;
  }
}

// ─── Nitter Twitter RSS search ───────────────────────────────────────────────
async function fetchNitterTweets(symbol) {
  const query = encodeURIComponent(`${symbol} solana -filter:retweets`);
  for (const host of NITTER_INSTANCES) {
    try {
      const res = await fetch(
        `https://${host}/search/rss?q=${query}&f=tweets`,
        {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; Homie/1.0)" },
          signal: AbortSignal.timeout(5_000),
        }
      );
      if (!res.ok) continue;
      const xml = await res.text();
      const titles = parseRssTitles(xml, 10);
      if (titles.length > 0) return { tweets: titles, source: host };
    } catch {
      // try next instance
    }
  }
  return null;
}

// ─── Google News RSS ─────────────────────────────────────────────────────────
async function fetchGoogleNews(symbol) {
  try {
    const q = encodeURIComponent(`${symbol} crypto solana`);
    const res = await fetch(
      `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`,
      { signal: AbortSignal.timeout(7_000) }
    );
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRssTitles(xml, 12);
  } catch {
    return [];
  }
}

// ─── CryptoPanic (optional — needs CRYPTOPANIC_API_KEY) ──────────────────────
async function fetchCryptoPanic(symbol) {
  const key = process.env.CRYPTOPANIC_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch(
      `https://cryptopanic.com/api/v1/posts/?auth_token=${key}&currencies=${symbol}&kind=news&public=true`,
      { signal: AbortSignal.timeout(6_000) }
    );
    if (!res.ok) return [];
    const json = await res.json() as any;
    return (json?.results ?? []).slice(0, 8).map((p) => p.title).filter(Boolean);
  } catch {
    return [];
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────
/**
 * Returns raw sentiment signals for a token.
 * @param {string} symbol  e.g. "SOL", "BONK"
 * @param {string} [mint]  optional mint address for on-chain data
 */
async function fetchAllSentimentData(symbol, mint) {
  const sym = symbol.toUpperCase();

  // Fetch all in parallel
  const [onChain, social, tweets, news, cpNews] = await Promise.all([
    fetchOnChain(mint),
    fetchStockTwits(sym),
    fetchNitterTweets(sym),
    fetchGoogleNews(sym),
    fetchCryptoPanic(sym),
  ]);

  // Merge all headline sources
  const allNews = [
    ...news,
    ...cpNews,
    ...(tweets?.tweets ?? []),
  ].filter(Boolean).slice(0, 15);

  return { onChain, social, tweets, headlines: allNews };
}

export { fetchAllSentimentData };