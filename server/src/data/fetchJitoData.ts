/**
 * Fetch live Jito data.
 * POST to stake_pool_stats for APY — no static fallbacks.
 */

let _cache: any = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchJitoSolApy(): Promise<number> {
  const res = await fetch("https://kobe.mainnet.jito.network/api/v1/stake_pool_stats", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Jito stake_pool_stats ${res.status}`);
  const data = await res.json() as any;
  const apyRaw = data?.apy?.[data.apy.length - 1]?.data;
  if (apyRaw == null) throw new Error("Jito: no APY data in response");
  return parseFloat((apyRaw * 100).toFixed(2));
}

async function fetchJitoMevStats() {
  const res = await fetch("https://kobe.mainnet.jito.network/api/v1/bundles/tip_floor", {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Jito MEV tip_floor ${res.status}`);
  const data = await res.json() as any;
  return {
    tip_floor_lamports: data[0]?.landed_tips_50th_percentile ?? null,
    tip_25th: data[0]?.landed_tips_25th_percentile ?? null,
    tip_75th: data[0]?.landed_tips_75th_percentile ?? null,
    tip_95th: data[0]?.landed_tips_95th_percentile ?? null,
  };
}

async function fetchJitoData() {
  if (_cache && Date.now() - _cacheTime < CACHE_TTL_MS) return _cache;

  const [apyResult, mevResult] = await Promise.allSettled([
    fetchJitoSolApy(),
    fetchJitoMevStats(),
  ]);

  if (apyResult.status === "rejected") {
    console.error("[Jito] APY fetch failed:", (apyResult.reason as Error).message);
  }
  if (mevResult.status === "rejected") {
    console.error("[Jito] MEV fetch failed:", (mevResult.reason as Error).message);
  }

  _cache = {
    jitosol_apy: apyResult.status === "fulfilled" ? apyResult.value : null,
    mev_tips: mevResult.status === "fulfilled" ? mevResult.value : null,
    fetched_at: new Date().toISOString(),
  };
  _cacheTime = Date.now();
  return _cache;
}

export { fetchJitoData, fetchJitoSolApy, fetchJitoMevStats };
