// @ts-nocheck
/**
 * adapters/orca.js — fetches Orca Whirlpool data via v2 REST API.
 *
 * Endpoint: GET https://api.orca.so/v2/solana/pools
 * Supports filters: minTvl, sortBy, stats=24h,7d, hasWarning, hasRewards
 *
 * Cache: 5 minutes.
 */

const BLUECHIP = new Set(["SOL","USDC","USDT","ETH","WETH","WBTC","MSOL","JITOSOL","BONK","WIF"]);
const STABLE   = new Set(["USDC","USDT","USDS","DAI","USDH"]);
const MEME     = new Set(["BONK","WIF","BOME","POPCAT","MYRO","SLERF","SAMO"]);

let cache   = null;
let cacheAt = 0;
const TTL   = 5 * 60 * 1000;

function signal() {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 8_000);
  return ctrl.signal;
}

async function fetchOrcaPools() {
  if (cache && Date.now() - cacheAt < TTL) return cache;

  let raw;
  try {
    // v2 pools endpoint with stats for volume data
    const res = await fetch(
      "https://api.orca.so/v2/solana/pools?minTvl=10000&sortBy=tvl&stats=24h,7d",
      { headers: { Accept: "application/json" }, signal: signal() }
    );
    if (!res.ok) throw new Error(`Orca API HTTP ${res.status}`);
    raw = await res.json();
  } catch (err) {
    // Fallback to legacy whirlpools endpoint
    try {
      const res = await fetch("https://api.orca.so/v2/solana/whirlpools", {
        headers: { Accept: "application/json" }, signal: signal(),
      });
      if (!res.ok) throw new Error(`Orca fallback HTTP ${res.status}`);
      raw = await res.json();
    } catch (err2) {
      console.warn("[orca adapter]", err.message, "| fallback:", err2.message);
      return cache ?? [];
    }
  }

  const items = Array.isArray(raw) ? raw : raw?.pools ?? raw?.whirlpools ?? raw?.data ?? [];

  const pools = items
    .map((w) => {
      const symA = (w?.tokenA?.symbol ?? w?.token_a?.symbol ?? "?").toUpperCase();
      const symB = (w?.tokenB?.symbol ?? w?.token_b?.symbol ?? "?").toUpperCase();
      const tokens = [symA, symB];
      const pair   = `${symA}-${symB}`;

      const tvl   = Number(w?.tvl ?? w?.totalValueLocked ?? 0);
      const vol7d = Number(
        w?.stats?.["7d"]?.volume ?? w?.volume?.week ?? w?.volume7d ?? w?.weekly_volume ?? 0
      );
      const vol24h = Number(
        w?.stats?.["24h"]?.volume ?? w?.volume?.day ?? w?.volume24h ?? w?.daily_volume ?? 0
      );

      // v2 uses apr/apy fields; handle both decimal (0.05) and percent (5.0) forms
      const rawApr  = Number(w?.apr ?? w?.feeApr ?? w?.totalApr ?? w?.stats?.["7d"]?.apr ?? 0);
      const apyPct  = parseFloat((rawApr < 2 ? rawApr * 100 : rawApr).toFixed(2));

      // Risk metadata from v2 API
      const hasWarning          = Boolean(w?.hasWarning ?? false);
      const lockedLiquidityPct  = Number(w?.lockedLiquidityPercent ?? 0);
      const adaptiveFee         = Boolean(w?.adaptiveFeeEnabled ?? false);
      const tickSpacing         = Number(w?.tickSpacing ?? 0);
      const hasRewards          = Boolean(w?.hasRewards ?? w?.rewardInfos?.some((r) => r?.emissionsPerSecondX64 > 0));
      const poolAddress         = w?.address ?? w?.whirlpool ?? w?.pubkey ?? null;
      const feeRate             = Number(w?.feeRate ?? w?.fee ?? 0);

      const isMemePool   = tokens.some((t) => MEME.has(t));
      const isStablePool = tokens.every((t) => STABLE.has(t));
      const isBluechipP  = tokens.every((t) => BLUECHIP.has(t)) && !isMemePool;
      const isUnknown    = tokens.some((t) => !BLUECHIP.has(t) && !STABLE.has(t) && !MEME.has(t));

      const rewardSource = hasRewards ? "mixed" : "fees";

      return {
        pair,
        tvl,
        apy:         apyPct,
        volume7d:    vol7d,
        volume24h,
        tokens,
        isStablePair:  isStablePool,
        isBluechip:    isBluechipP,
        isMeme:        isMemePool,
        isUnknown,
        audited:       true,
        rewardSource,
        protocol:      "Orca",
        action:        "lp",
        address:       poolAddress,
        // v2 risk signals — surfaced in agent responses
        hasWarning,
        lockedLiquidityPct,
        adaptiveFee,
        tickSpacing,
        feeRate,
        description:   `Provide liquidity ${pair} on Orca Whirlpool (${apyPct}% APY)${hasWarning ? " ⚠ WARNING" : ""}`,
        url:           poolAddress
          ? `https://www.orca.so/liquidity/browse?address=${poolAddress}`
          : "https://www.orca.so/liquidity/browse",
      };
    })
    .filter((p) => p.tvl >= 10_000);

  if (pools.length > 0) {
    cache   = pools;
    cacheAt = Date.now();
  }

  return pools;
}

module.exports = { fetchOrcaPools };