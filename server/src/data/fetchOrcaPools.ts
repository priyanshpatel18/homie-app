/**
 * Fetch Orca Whirlpool pools for a token pair with live APR data.
 * Uses Orca's public API: api.mainnet.orca.so/v1/whirlpool/list
 */

let cache = null;
let cacheTime = 0;
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 min

async function fetchAllOrcaPools() {
  if (cache && Date.now() - cacheTime < CACHE_TTL_MS) return cache;
  const res = await fetch("https://api.mainnet.orca.so/v1/whirlpool/list", {
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Orca API ${res.status}`);
  const json = await res.json() as any;
  cache     = json?.whirlpools ?? json?.data ?? [];
  cacheTime = Date.now();
  return cache;
}

// Find pools for a token pair (order-insensitive), sorted by TVL
async function fetchOrcaPoolsForPair(tokenA, tokenB) {
  const a = tokenA.toUpperCase();
  const b = tokenB.toUpperCase();
  const all = await fetchAllOrcaPools();

  const matches = all.filter((p) => {
    const sa = (p.tokenA?.symbol ?? "").toUpperCase();
    const sb = (p.tokenB?.symbol ?? "").toUpperCase();
    return (sa === a && sb === b) || (sa === b && sb === a);
  });

  return matches
    .sort((x, y) => (y.tvl ?? 0) - (x.tvl ?? 0))
    .map((p) => ({
      address:      p.address,
      tokenA:       p.tokenA?.symbol ?? a,
      tokenB:       p.tokenB?.symbol ?? b,
      feeTierPct:   p.lpFeeRate != null ? +(p.lpFeeRate * 100).toFixed(3) : null,
      tvlUsd:       p.tvl ?? null,
      feeAprPct:    p.feeApr  != null ? +(p.feeApr  * 100).toFixed(2) : null,
      rewardAprPct: p.rewardApr != null ? +(p.rewardApr * 100).toFixed(2) : null,
      totalAprPct:  p.totalApr != null
        ? +(p.totalApr * 100).toFixed(2)
        : p.feeApr != null
          ? +((p.feeApr + (p.rewardApr ?? 0)) * 100).toFixed(2)
          : null,
    }));
}

// Top pools by TVL across the whole protocol (for general "show me Orca pools" queries)
async function fetchOrcaTopPools(limit = 10) {
  const all = await fetchAllOrcaPools();
  return all
    .filter((p) => (p.tvl ?? 0) > 10_000)
    .sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0))
    .slice(0, limit)
    .map((p) => ({
      address:     p.address,
      pair:        `${p.tokenA?.symbol ?? "?"}-${p.tokenB?.symbol ?? "?"}`,
      feeTierPct:  p.lpFeeRate != null ? +(p.lpFeeRate * 100).toFixed(3) : null,
      tvlUsd:      p.tvl ?? null,
      totalAprPct: p.totalApr != null ? +(p.totalApr * 100).toFixed(2) : null,
    }));
}

export { fetchOrcaPoolsForPair, fetchOrcaTopPools };