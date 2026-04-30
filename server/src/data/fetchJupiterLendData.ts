/**
 * Jupiter Lend / Earn data fetcher.
 * Uses the public REST API at https://api.jup.ag/lend/v1
 * to pull available earn tokens, APYs, TVL, and user positions.
 *
 * No SDK dependency required — pure HTTP.
 */

const JUP_LEND_BASE = "https://api.jup.ag/lend/v1";

// Cache for 5 minutes
let _tokensCache = null;
let _tokensCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

function apiHeaders() {
  const h = { Accept: "application/json" };
  if (process.env.JUP_API_KEY) h["x-api-key"] = process.env.JUP_API_KEY;
  return h;
}

/**
 * Fetch all Jupiter Earn tokens with their current APY / TVL.
 * GET /earn/tokens
 */
async function fetchJupiterEarnTokens() {
  if (_tokensCache && Date.now() - _tokensCacheTime < CACHE_TTL) {
    return _tokensCache;
  }

  try {
    const res = await fetch(`${JUP_LEND_BASE}/earn/tokens`, {
      headers: apiHeaders(),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) throw new Error(`Jupiter Lend API ${res.status}`);

    const raw = await res.json() as any;
    const tokens = Array.isArray(raw) ? raw : raw?.data ?? raw?.tokens ?? [];

    const result = tokens.map((t) => {
      // Normalize APY — API may return decimal (0.05) or percent (5.0)
      let supplyApy = t.supply_rate ?? t.supplyRate ?? t.apy ?? t.supply_apy ?? null;
      if (supplyApy !== null && supplyApy < 1) supplyApy = parseFloat((supplyApy * 100).toFixed(2));
      else if (supplyApy !== null) supplyApy = parseFloat(supplyApy.toFixed(2));

      let rewardsApy = t.rewards_rate ?? t.rewardsRate ?? t.rewards_apy ?? null;
      if (rewardsApy !== null && rewardsApy < 1) rewardsApy = parseFloat((rewardsApy * 100).toFixed(2));
      else if (rewardsApy !== null) rewardsApy = parseFloat(rewardsApy.toFixed(2));

      const totalApy = supplyApy !== null
        ? parseFloat(((supplyApy ?? 0) + (rewardsApy ?? 0)).toFixed(2))
        : null;

      return {
        symbol:     (t.symbol ?? t.token_symbol ?? "").toUpperCase(),
        name:       t.name ?? t.token_name ?? t.symbol ?? "",
        mint:       t.mint ?? t.address ?? t.token_mint ?? null,
        supplyApy,
        rewardsApy,
        totalApy,
        totalSupply: t.total_supply ?? t.totalSupply ?? t.tvl ?? null,
        totalSupplyUsd: t.total_supply_usd ?? t.totalSupplyUsd ?? t.tvl_usd ?? null,
        decimals:   t.decimals ?? 6,
        logoUri:    t.logo_uri ?? t.logoURI ?? null,
      };
    });

    _tokensCache = result;
    _tokensCacheTime = Date.now();
    console.log(`[Jupiter Lend] fetched ${result.length} earn tokens`);
    return result;
  } catch (err: any) {
    console.warn("[Jupiter Lend] tokens fetch failed:", err.message);
    // Return cache if available, otherwise empty
    return _tokensCache ?? [];
  }
}

/**
 * Fetch a user's Jupiter Earn positions.
 * GET /earn/positions?users={wallet}
 */
async function fetchJupiterEarnPositions(walletAddress) {
  try {
    const res = await fetch(
      `${JUP_LEND_BASE}/earn/positions?users=${walletAddress}`,
      { headers: apiHeaders(), signal: AbortSignal.timeout(10000) },
    );
    if (!res.ok) throw new Error(`Jupiter Lend positions API ${res.status}`);
    return await res.json() as any;
  } catch (err: any) {
    console.warn("[Jupiter Lend] positions fetch failed:", err.message);
    return [];
  }
}

/**
 * Get the primary Jupiter Earn data summary for the agent.
 * Returns top tokens sorted by APY.
 */
async function fetchJupiterLendData() {
  const tokens = await fetchJupiterEarnTokens();

  // Sort by total APY descending
  const sorted = [...tokens]
    .filter((t) => t.totalApy !== null)
    .sort((a, b) => (b.totalApy ?? 0) - (a.totalApy ?? 0));

  return {
    protocol: "Jupiter Lend",
    totalTokens: tokens.length,
    topTokens: sorted.slice(0, 10),
    allTokens: sorted,
    fetched_at: new Date().toISOString(),
  };
}

export { fetchJupiterEarnTokens, fetchJupiterEarnPositions, fetchJupiterLendData };