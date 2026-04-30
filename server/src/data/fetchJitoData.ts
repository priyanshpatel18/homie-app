/**
 * Fetch live Jito data:
 * - jitoSOL APY (staking + MEV tips)
 * - Jito stake pool stats (TVL, exchange rate)
 * - MEV tip stats
 *
 * Falls back to static values if APIs are unavailable.
 */

const FALLBACKS = {
  jitosol_apy: 7.8,
  jitosol_tvl_sol: 14_000_000,
  jitosol_exchange_rate: 1.15,
};

// Cache for 5 minutes
let cache = null;
let cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Fetch jitoSOL APY from Jito's public API.
 * The API returns the total APY including base staking yield + MEV tips.
 */
async function fetchJitoSolApy() {
  try {
    // Jito's public stats endpoint
    const res = await fetch("https://kobe.mainnet.jito.network/api/v1/stake_pool_stats", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) throw new Error(`Jito API ${res.status}`);

    const data = await res.json() as any;

    // Extract APY — response shape varies by endpoint version
    const apy = data.apy ?? data.stake_pool_apy ?? data.total_apy ?? null;
    const tvl = data.total_sol_staked ?? data.tvl_sol ?? null;
    const rate = data.pool_token_price ?? data.exchange_rate ?? null;

    return {
      apy: apy !== null
        ? (apy < 1 ? parseFloat((apy * 100).toFixed(2)) : parseFloat(apy.toFixed(2)))
        : FALLBACKS.jitosol_apy,
      tvl_sol: tvl ?? FALLBACKS.jitosol_tvl_sol,
      exchange_rate: rate ?? FALLBACKS.jitosol_exchange_rate,
    };
  } catch (err: any) {
    // Fallback: try the simpler Solana Compass endpoint
    try {
      const fallbackRes = await fetch(
        "https://api.solanacompass.com/staking/apy?pool=jitosol",
        { signal: AbortSignal.timeout(5000) }
      );
      if (fallbackRes.ok) {
        const fbData = await fallbackRes.json() as any;
        const fbApy = fbData.apy ?? fbData.total_apy ?? null;
        if (fbApy !== null) {
          return {
            apy: fbApy < 1 ? parseFloat((fbApy * 100).toFixed(2)) : parseFloat(fbApy.toFixed(2)),
            tvl_sol: FALLBACKS.jitosol_tvl_sol,
            exchange_rate: FALLBACKS.jitosol_exchange_rate,
          };
        }
      }
    } catch { /* ignore fallback failure */ }

    console.warn("[Jito Data] API failed, using fallback:", err.message);
    return {
      apy: FALLBACKS.jitosol_apy,
      tvl_sol: FALLBACKS.jitosol_tvl_sol,
      exchange_rate: FALLBACKS.jitosol_exchange_rate,
    };
  }
}

/**
 * Fetch Jito MEV tip statistics.
 */
async function fetchJitoMevStats() {
  try {
    const res = await fetch("https://kobe.mainnet.jito.network/api/v1/bundles/tip_floor", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) throw new Error(`Jito MEV API ${res.status}`);

    const data = await res.json() as any;
    return {
      tip_floor_lamports: data[0]?.landed_tips_50th_percentile ?? 10000,
      tip_25th: data[0]?.landed_tips_25th_percentile ?? 5000,
      tip_75th: data[0]?.landed_tips_75th_percentile ?? 50000,
      tip_95th: data[0]?.landed_tips_95th_percentile ?? 100000,
    };
  } catch (err: any) {
    console.warn("[Jito MEV Stats] failed:", err.message);
    return {
      tip_floor_lamports: 10000,
      tip_25th: 5000,
      tip_75th: 50000,
      tip_95th: 100000,
    };
  }
}

/**
 * Fetch all Jito data with caching.
 */
async function fetchJitoData() {
  if (cache && Date.now() - cacheTime < CACHE_TTL_MS) {
    return cache;
  }

  const [poolData, mevData] = await Promise.allSettled([
    fetchJitoSolApy(),
    fetchJitoMevStats(),
  ]);

  cache = {
    jitosol_apy: poolData.status === "fulfilled" ? poolData.value.apy : FALLBACKS.jitosol_apy,
    jitosol_tvl_sol: poolData.status === "fulfilled" ? poolData.value.tvl_sol : FALLBACKS.jitosol_tvl_sol,
    jitosol_exchange_rate: poolData.status === "fulfilled" ? poolData.value.exchange_rate : FALLBACKS.jitosol_exchange_rate,
    mev_tips: mevData.status === "fulfilled" ? mevData.value : { tip_floor_lamports: 10000 },
    fetched_at: new Date().toISOString(),
  };
  cacheTime = Date.now();

  console.log("[Jito Data] fetched:", cache);
  return cache;
}

export { fetchJitoData, fetchJitoSolApy, fetchJitoMevStats };