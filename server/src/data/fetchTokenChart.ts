/**
 * Fetch price chart + token stats for any Solana token.
 *
 * Known tokens  → CoinGecko (stats + chart, consistent data)
 * Others        → Birdeye (stats) + GeckoTerminal (OHLCV)
 * Fallback       → Dexscreener
 */

// ─── Known mints ─────────────────────────────────────────────────────────────
const KNOWN_MINTS = {
  SOL:      "So11111111111111111111111111111111111111112",
  WSOL:     "So11111111111111111111111111111111111111112",
  BONK:     "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  JUP:      "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  WIF:      "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
  PYTH:     "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",
  RAY:      "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
  ORCA:     "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",
  MSOL:     "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
  JITOSOL:  "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
  BSOL:     "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1",
  USDC:     "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT:     "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  RENDER:   "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof",
  HNT:      "hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux",
  POPCAT:   "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
  MEW:      "MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5",
  TRUMP:    "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN",
  MELANIA:  "FUAfBo2jgks6gB4Z4LfZkqSZgzNucisEHqnNebaRxM1P",
  PENGU:    "2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv",
  FARTCOIN: "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump",
  AI16Z:    "HeLp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n4V98jwC",
};

// Major tokens with reliable CoinGecko IDs — use CG for both stats + chart
const CG_ID_BY_MINT = {
  "So11111111111111111111111111111111111111112": "solana",
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": "bonk",
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": "jupiter-exchange-solana",
  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm": "dogwifcoin",
  "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3": "pyth-network",
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": "raydium",
  "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE":  "orca",
  "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So":  "msol",
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "usd-coin",
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": "tether",
  "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr": "popcat",
  "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof":  "render-token",
  "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN": "official-trump",
  "2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv": "pudgy-penguins",
  "MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5":  "cat-in-a-dogs-world",
};

const CG_DAYS = { "1H": "0.04167", "24H": "1", "7D": "7", "30D": "30", "1Y": "365" };

// GeckoTerminal OHLCV — 1H uses 2-min candles to avoid rate limiting
const GT_OHLCV = {
  "1H":  { timeframe: "minute", aggregate: 2, limit: 30 },
  "24H": { timeframe: "hour",   aggregate: 1, limit: 24 },
  "7D":  { timeframe: "hour",   aggregate: 4, limit: 42 },
  "30D": { timeframe: "day",    aggregate: 1, limit: 30 },
  "1Y":  { timeframe: "day",    aggregate: 7, limit: 53 },
};

const IS_MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// ─── Cache — 5-min TTL ────────────────────────────────────────────────────────
const cache    = new Map();
const CACHE_MS = 5 * 60 * 1000;

function getCached(key)       { const e = cache.get(key); if (!e) return null; if (Date.now() - e.ts > CACHE_MS) { cache.delete(key); return null; } return e.data; }
function setCache(key, data)  { cache.set(key, { ts: Date.now(), data }); }

// ─── GeckoTerminal rate limiter (max 2 concurrent) ───────────────────────────
let geckoActive = 0;
const geckoQueue = [];
function geckoEnqueue(fn) {
  return new Promise((res, rej) => { geckoQueue.push({ fn, res, rej }); drainGecko(); });
}
function drainGecko() {
  while (geckoActive < 2 && geckoQueue.length > 0) {
    const { fn, res, rej } = geckoQueue.shift();
    geckoActive++;
    fn().then(res, rej).finally(() => { geckoActive--; drainGecko(); });
  }
}

// ─── Logo resolution ──────────────────────────────────────────────────────────
// Tries provided URL first; returns null so we fall through to Jupiter lookup.
function resolveLogoUrl(mint, providedUrl) {
  if (providedUrl && providedUrl.startsWith("http")) return providedUrl;
  // Legacy solana-labs CDN is archived — return null so the async Jupiter
  // lookup at the end of fetchTokenChart fills it in.
  return null;
}

// Fetch logo from Jupiter token metadata — most reliable source for Solana tokens
async function fetchJupiterLogo(mint) {
  if (!mint) return null;
  try {
    const res = await fetch(
      `https://api.jup.ag/tokens/v1/${mint}`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return null;
    const data = await res.json() as any;
    return data?.logoURI || null;
  } catch {
    return null;
  }
}

// ─── Jupiter token search → mint ─────────────────────────────────────────────
async function resolveMintFromJupiter(symbol) {
  try {
    const res = await fetch(
      `https://api.jup.ag/tokens/v1/search?query=${encodeURIComponent(symbol)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const tokens = await res.json() as any;
    if (!Array.isArray(tokens) || tokens.length === 0) return null;
    const sym   = symbol.toUpperCase();
    const exact = tokens.find((t) => t.symbol?.toUpperCase() === sym);
    return (exact ?? tokens[0])?.address ?? null;
  } catch { return null; }
}

// ─── CoinGecko — stats + chart (single source of truth for known tokens) ─────
async function fetchFromCoinGecko(cgId, mint, range) {
  const cacheKey = `cg:${cgId}:${range}`;
  const cached   = getCached(cacheKey);
  if (cached) return cached;

  const days = CG_DAYS[range] ?? "1";
  const [chartRes, detailRes] = await Promise.allSettled([
    fetch(
      `https://api.coingecko.com/api/v3/coins/${cgId}/market_chart?vs_currency=usd&days=${days}`,
      { signal: AbortSignal.timeout(8000) }
    ),
    fetch(
      `https://api.coingecko.com/api/v3/coins/${cgId}?localization=false&tickers=false&community_data=false&developer_data=false`,
      { signal: AbortSignal.timeout(8000) }
    ),
  ]);

  if (chartRes.status !== "fulfilled" || !chartRes.value.ok) return null;
  if (detailRes.status !== "fulfilled" || !detailRes.value.ok) return null;

  const chartData  = await chartRes.value.json() as any;
  const detailData = await detailRes.value.json() as any;
  const market     = detailData.market_data ?? {};

  const rawPrices = chartData.prices ?? [];
  const step      = Math.max(1, Math.floor(rawPrices.length / 60));
  const prices    = rawPrices
    .filter((_, i) => i % step === 0)
    .map(([ts, price]) => ({ ts, price }));

  const fp = prices[0]?.price ?? 0;
  const lp = prices[prices.length - 1]?.price ?? 0;
  const priceChangeRange = fp > 0
    ? parseFloat(((lp - fp) / fp * 100).toFixed(2))
    : 0;

  const result = {
    symbol:         detailData.symbol?.toUpperCase() ?? cgId,
    name:           detailData.name ?? cgId,
    image:          detailData.image?.small ?? resolveLogoUrl(mint, null),
    price:          market.current_price?.usd ?? lp,
    priceChange24h: market.price_change_percentage_24h ?? 0,
    priceChangeRange,
    volume24h:      market.total_volume?.usd       ?? null,
    marketCap:      market.market_cap?.usd         ?? null,
    fdv:            market.fully_diluted_valuation?.usd ?? null,
    supply:         market.circulating_supply      ?? null,
    liquidity:      null,
    holders:        null,
    mintAddress:    mint,
    prices,
    range,
    source: "coingecko",
  };

  setCache(cacheKey, result);
  return result;
}

// ─── GeckoTerminal OHLCV — long-tail tokens only ─────────────────────────────
async function fetchOhlcvFromGeckoTerminal(mint, range) {
  const cacheKey = `gt:${mint}:${range}`;
  const cached   = getCached(cacheKey);
  if (cached) return cached;

  return geckoEnqueue(async () => {
    try {
      const poolsRes = await fetch(
        `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mint}/pools?page=1&sort=h24_volume_usd_liquidity_desc`,
        { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) }
      );
      if (!poolsRes.ok) return [];
      const poolsData = await poolsRes.json() as any;
      const poolItem  = poolsData?.data?.[0];
      const poolAddr  = poolItem?.attributes?.address ?? poolItem?.id?.replace(/^solana_/, "");
      if (!poolAddr) return [];

      const { timeframe, aggregate, limit } = GT_OHLCV[range] ?? GT_OHLCV["24H"];
      const ohlcvRes = await fetch(
        `https://api.geckoterminal.com/api/v2/networks/solana/pools/${poolAddr}/ohlcv/${timeframe}?aggregate=${aggregate}&limit=${limit}&currency=usd&token=base`,
        { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) }
      );
      if (!ohlcvRes.ok) {
        // 1H rate-limited → retry with 5-min candles (12 points)
        if (ohlcvRes.status === 429 && range === "1H") {
          const retryRes = await fetch(
            `https://api.geckoterminal.com/api/v2/networks/solana/pools/${poolAddr}/ohlcv/minute?aggregate=5&limit=12&currency=usd&token=base`,
            { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) }
          ).catch(() => null);
          if (retryRes?.ok) {
            const retryData = await retryRes.json() as any;
            const retryPrices = (retryData?.data?.attributes?.ohlcv_list ?? [])
              .reverse()
              .map(([ts, , , , close]) => ({ ts: ts * 1000, price: close }))
              .filter((p) => p.price > 0);
            if (retryPrices.length > 0) { setCache(cacheKey, retryPrices); return retryPrices; }
          }
        }
        console.warn("[gecko] ohlcv", ohlcvRes.status, mint, range);
        return [];
      }

      const ohlcvData = await ohlcvRes.json() as any;
      const prices    = (ohlcvData?.data?.attributes?.ohlcv_list ?? [])
        .reverse()
        .map(([ts, , , , close]) => ({ ts: ts * 1000, price: close }))
        .filter((p) => p.price > 0);

      console.log(`[gecko] ${mint.slice(0, 8)} ${range}: ${prices.length} candles`);
      if (prices.length > 0) setCache(cacheKey, prices);
      return prices;
    } catch (err: any) { console.warn("[gecko] error:", err.message); return []; }
  });
}

// ─── Birdeye — stats for long-tail tokens ────────────────────────────────────
function birdeyeHeaders() {
  const h = { "X-Chain": "solana" };
  if (process.env.BIRDEYE_API_KEY) h["X-API-KEY"] = process.env.BIRDEYE_API_KEY;
  return h;
}

async function fetchBirdeyeOverview(mint) {
  try {
    const res = await fetch(
      `https://public-api.birdeye.so/defi/token_overview?address=${mint}`,
      { headers: birdeyeHeaders(), signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return null;
    const json = await res.json() as any;
    return json?.data ?? null;
  } catch { return null; }
}

// ─── Dexscreener fallback ─────────────────────────────────────────────────────
async function fetchFromDexscreener(mintOrSymbol, range) {
  try {
    const isMint = IS_MINT.test(mintOrSymbol);
    const url    = isMint
      ? `https://api.dexscreener.com/latest/dex/tokens/${mintOrSymbol}`
      : `https://api.dexscreener.com/latest/dex/search/?q=${encodeURIComponent(mintOrSymbol)}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data  = await res.json() as any;
    const pairs = (data.pairs ?? []).filter((p) => p.chainId === "solana");
    if (pairs.length === 0) return null;

    const pair         = pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
    const resolvedMint = isMint ? mintOrSymbol : (pair.baseToken?.address ?? null);
    const prices       = resolvedMint ? await fetchOhlcvFromGeckoTerminal(resolvedMint, range) : [];

    const fp = prices[0]?.price ?? 0;
    const lp = prices[prices.length - 1]?.price ?? 0;
    const priceChangeRange = fp > 0
      ? parseFloat(((lp - fp) / fp * 100).toFixed(2))
      : (pair.priceChange?.h24 ?? 0);

    return {
      symbol:         pair.baseToken.symbol,
      name:           pair.baseToken.name,
      image:          resolveLogoUrl(resolvedMint ?? "", pair.info?.imageUrl),
      price:          parseFloat(pair.priceUsd ?? 0),
      priceChange24h: pair.priceChange?.h24 ?? 0,
      priceChangeRange,
      volume24h:      pair.volume?.h24     ?? null,
      marketCap:      pair.marketCap ?? pair.fdv ?? null,
      fdv:            pair.fdv       ?? null,
      supply:         null,
      liquidity:      pair.liquidity?.usd ?? null,
      holders:        null,
      mintAddress:    resolvedMint ?? null,
      prices,
      range,
      source: "dexscreener",
    };
  } catch { return null; }
}

// ─── Normalize SOL name ───────────────────────────────────────────────────────
function normalizeResult(result, requestedSymbol) {
  if (!result) return result;
  if (requestedSymbol.toUpperCase() === "SOL" &&
      (result.symbol === "SOL" || result.symbol === "WSOL" || result.name?.toLowerCase().includes("wrapped sol"))) {
    result.name = "Solana"; result.symbol = "SOL";
  }
  return result;
}

// ─── Main export ──────────────────────────────────────────────────────────────
async function fetchTokenChart(symbolOrMint, range = "24H") {
  const input = (symbolOrMint ?? "").trim();
  if (!input) return null;

  const isMint = IS_MINT.test(input);

  // 1. Resolve symbol → mint
  let mint = isMint ? input : (KNOWN_MINTS[input.toUpperCase()] ?? null);
  if (!mint && !isMint) {
    mint = await resolveMintFromJupiter(input).catch(() => null);
  }

  let result = null;

  if (mint) {
    const cgId = CG_ID_BY_MINT[mint];

    // 2a. Known tokens: CoinGecko for everything (consistent stats + chart)
    if (cgId) {
      const cg = await fetchFromCoinGecko(cgId, mint, range).catch(() => null);
      if (cg) result = normalizeResult(cg, input);
    }

    // 2b. Unknown tokens: Birdeye stats + GeckoTerminal OHLCV
    if (!result) {
      const [overview, prices] = await Promise.all([
        fetchBirdeyeOverview(mint),
        fetchOhlcvFromGeckoTerminal(mint, range),
      ]);

      if (overview || prices.length > 0) {
        const t  = overview ?? {};
        const fp = prices[0]?.price ?? 0;
        const lp = prices[prices.length - 1]?.price ?? 0;
        const priceChangeRange = fp > 0 ? parseFloat(((lp - fp) / fp * 100).toFixed(2)) : 0;

        result = normalizeResult({
          symbol:         t.symbol  ?? input.toUpperCase(),
          name:           t.name    ?? t.symbol ?? input,
          image:          resolveLogoUrl(mint, t.logoURI),
          price:          t.price   ?? lp ?? 0,
          priceChange24h: t.priceChange24hPercent ?? 0,
          priceChangeRange,
          volume24h:  t.v24hUSD   ?? null,
          marketCap:  t.mc        ?? null,
          fdv:        t.fdv       ?? null,
          supply:     t.supply    ?? null,
          liquidity:  t.liquidity ?? null,
          holders:    t.holder    ?? null,
          mintAddress: mint,
          prices,
          range,
          source: "birdeye+geckoterminal",
        }, input);
      }
    }
  }

  // 3. Dexscreener fallback
  if (!result) {
    const ds = await fetchFromDexscreener(mint ?? input, range).catch(() => null);
    result = normalizeResult(ds, input);
  }

  // 4. Ensure logo — if no source provided a valid image, try Jupiter metadata
  if (result && !result.image) {
    result.image = await fetchJupiterLogo(result.mintAddress).catch(() => null);
  }

  return result;
}

export { fetchTokenChart };