/**
 * Fetch Meteora DLMM pools for a token pair with live APR / fee data.
 * Uses Meteora's DLMM API: dlmm-api.meteora.ag
 */

const DLMM_API = "https://dlmm-api.meteora.ag";

// Search pools by token pair name (Meteora API supports name search)
async function fetchMeteoraPoolsForPair(tokenA, tokenB) {
  const query = `${tokenA.toUpperCase()}-${tokenB.toUpperCase()}`;
  const queryAlt = `${tokenB.toUpperCase()}-${tokenA.toUpperCase()}`;

  let pools = [];
  for (const q of [query, queryAlt]) {
    try {
      const res = await fetch(
        `${DLMM_API}/pair/all_with_pagination?page=0&limit=10&search_term=${encodeURIComponent(q)}`,
        { signal: AbortSignal.timeout(7_000) }
      );
      if (!res.ok) continue;
      const json = await res.json() as any;
      const rows = json?.data ?? json?.pairs ?? [];
      if (rows.length) { pools = rows; break; }
    } catch { /* try next */ }
  }

  // Fallback: hit the general endpoint and filter client-side
  if (!pools.length) {
    try {
      const res = await fetch(
        `${DLMM_API}/pair/all_by_groups?include_unknown=false`,
        { signal: AbortSignal.timeout(8_000) }
      );
      if (res.ok) {
        const json = await res.json() as any;
        const all  = json?.groups?.flatMap((g) => g.pairs ?? []) ?? json?.data ?? [];
        const a = tokenA.toUpperCase();
        const b = tokenB.toUpperCase();
        pools = all.filter((p) => {
          const name = (p.name ?? "").toUpperCase();
          return (name.includes(a) && name.includes(b));
        });
      }
    } catch {}
  }

  return pools
    .sort((x, y) => (y.liquidity ?? 0) - (x.liquidity ?? 0))
    .slice(0, 5)
    .map((p) => ({
      address:     p.address,
      name:        p.name ?? `${tokenA}-${tokenB}`,
      binStep:     p.bin_step ?? null,
      feePct:      p.base_fee_percentage != null ? +parseFloat(p.base_fee_percentage).toFixed(3) : null,
      tvlUsd:      p.liquidity != null ? +parseFloat(p.liquidity).toFixed(2) : null,
      apr24hPct:   p.apr != null ? +parseFloat(p.apr).toFixed(2) : null,
      apy24hPct:   p.apy != null ? +parseFloat(p.apy).toFixed(2) : null,
      feeApr24h:   p.fee_apr != null ? +parseFloat(p.fee_apr).toFixed(2) : null,
    }));
}

// Top Meteora DLMM pools by TVL
async function fetchMeteoraTopPools(limit = 10) {
  try {
    const res = await fetch(
      `${DLMM_API}/pair/all_by_groups?include_unknown=false`,
      { signal: AbortSignal.timeout(8_000) }
    );
    if (!res.ok) throw new Error(`Meteora API ${res.status}`);
    const json = await res.json() as any;
    const all  = json?.groups?.flatMap((g) => g.pairs ?? []) ?? json?.data ?? [];

    return all
      .filter((p) => (p.liquidity ?? 0) > 10_000)
      .sort((a, b) => (b.liquidity ?? 0) - (a.liquidity ?? 0))
      .slice(0, limit)
      .map((p) => ({
        address:   p.address,
        name:      p.name ?? "?",
        tvlUsd:    p.liquidity != null ? +parseFloat(p.liquidity).toFixed(2) : null,
        apr24hPct: p.apr  != null ? +parseFloat(p.apr).toFixed(2) : null,
        feePct:    p.base_fee_percentage != null ? +parseFloat(p.base_fee_percentage).toFixed(3) : null,
      }));
  } catch (e: any) {
    throw new Error(`Meteora pool fetch failed: ${e.message}`);
  }
}

export { fetchMeteoraPoolsForPair, fetchMeteoraTopPools };