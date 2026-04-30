// @ts-nocheck
/**
 * Live market data — SOL price, top Solana DeFi yields, trending tokens.
 * All fetches are independent; failures return null so the LLM still runs.
 * Results are cached for 5 minutes.
 */

const CACHE_TTL = 5 * 60 * 1000;
let cache = null;
let cacheAt = 0;

// ─── SOL price + 24h change from CoinGecko (free, no key) ───────────────────
async function fetchSolPrice() {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true",
    { signal: AbortSignal.timeout(6000) }
  );
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const data = await res.json() as any;
  return {
    usd: data.solana.usd,
    change24h: parseFloat(data.solana.usd_24h_change.toFixed(2)),
  };
}

// ─── Top Solana pools from DeFiLlama ────────────────────────────────────────
async function fetchTopPools() {
  const res = await fetch("https://yields.llama.fi/pools", {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`DeFiLlama ${res.status}`);
  const { data } = await res.json() as any;

  // Filter: Solana chain, non-stablecoin, meaningful TVL and APY
  return data
    .filter(
      (p) =>
        p.chain === "Solana" &&
        !p.stablecoin &&
        p.tvlUsd > 500_000 &&
        p.apy > 0.5 &&
        p.apy < 500 // filter out obvious outliers
    )
    .sort((a, b) => b.tvlUsd - a.tvlUsd)
    .slice(0, 15)
    .map((p) => ({
      protocol: p.project,
      pool: p.symbol,
      apy: parseFloat(p.apy.toFixed(2)),
      tvlM: parseFloat((p.tvlUsd / 1_000_000).toFixed(2)),
      ilRisk: p.ilRisk ?? "none",
      exposure: p.exposure ?? null,
    }));
}

// ─── Trending tokens on Solana from Birdeye ──────────────────────────────────
function birdeyeHeaders() {
  const h = { "X-Chain": "solana" };
  if (process.env.BIRDEYE_API_KEY) h["X-API-KEY"] = process.env.BIRDEYE_API_KEY;
  return h;
}

async function fetchTrending() {
  const res = await fetch(
    "https://public-api.birdeye.so/defi/token_trending?sort_by=rank&sort_type=asc&offset=0&limit=10",
    {
      headers: birdeyeHeaders(),
      signal: AbortSignal.timeout(6000),
    }
  );
  if (!res.ok) throw new Error(`Birdeye ${res.status}`);
  const data = await res.json() as any;
  const items = data?.data?.tokens ?? data?.data?.items ?? [];
  return items.slice(0, 8).map((t) => ({
    symbol: t.symbol ?? t.name ?? "?",
    price: t.price ?? null,
    change24h: t.priceChange24hPercent ?? t.v24hChangePercent ?? null,
    volume24hM: t.v24hUSD ? parseFloat((t.v24hUSD / 1_000_000).toFixed(2)) : null,
  }));
}

// ─── Marinade + Kamino APYs (reuse existing logic inline) ────────────────────
async function fetchProtocolRates() {
  const results = {};

  try {
    const r = await fetch("https://api.marinade.finance/msol/apy/1y", {
      signal: AbortSignal.timeout(5000),
    });
    if (r.ok) {
      const d = await r.json() as any;
      const raw = d.value ?? d.apy ?? d.total ?? null;
      if (raw !== null) results.marinadeApy = raw < 1 ? +(raw * 100).toFixed(2) : +raw.toFixed(2);
    }
  } catch {}

  try {
    const r = await fetch("https://api.kamino.finance/v2/kamino-market", {
      signal: AbortSignal.timeout(5000),
    });
    if (r.ok) {
      const market = await r.json() as any;
      const reserves = market?.reserves ?? market?.data?.reserves ?? [];
      for (const reserve of reserves) {
        const sym = (reserve?.symbol ?? reserve?.mint_symbol ?? "").toUpperCase();
        const apy =
          reserve?.supply_apy ?? reserve?.supplyApy ?? reserve?.metrics?.supply_apy ?? null;
        if (apy === null) continue;
        const pct = apy < 1 ? +(apy * 100).toFixed(2) : +apy.toFixed(2);
        if (sym === "SOL") results.kaminoSolApy = pct;
        if (sym === "USDC") results.kaminoUsdcApy = pct;
      }
    }
  } catch {}

  return results;
}

// ─── Main export ─────────────────────────────────────────────────────────────
async function fetchMarketContext() {
  if (cache && Date.now() - cacheAt < CACHE_TTL) return cache;

  const [priceRes, poolsRes, trendingRes, ratesRes] = await Promise.allSettled([
    fetchSolPrice(),
    fetchTopPools(),
    fetchTrending(),
    fetchProtocolRates(),
  ]);

  cache = {
    sol: priceRes.status === "fulfilled" ? priceRes.value : null,
    topPools: poolsRes.status === "fulfilled" ? poolsRes.value : [],
    trending: trendingRes.status === "fulfilled" ? trendingRes.value : [],
    rates: ratesRes.status === "fulfilled" ? ratesRes.value : {},
    fetchedAt: new Date().toISOString(),
  };
  cacheAt = Date.now();

  if (priceRes.status === "rejected")   console.warn("SOL price failed:", priceRes.reason?.message);
  if (poolsRes.status === "rejected")   console.warn("DeFiLlama failed:", poolsRes.reason?.message);
  if (trendingRes.status === "rejected") console.warn("Birdeye failed:", trendingRes.reason?.message);

  return cache;
}

export { fetchMarketContext };