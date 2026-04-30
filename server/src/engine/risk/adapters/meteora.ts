// @ts-nocheck
/**
 * adapters/meteora.js — fetches Meteora DLMM pool data.
 *
 * Primary endpoint: https://dlmm.datapi.meteora.ag/pools (new analytics API)
 * Fallback:         https://dlmm-api.meteora.ag/pair/all_with_pagination
 *
 * Cache: 5 minutes.
 */

const BLUECHIP = new Set(["SOL","USDC","USDT","ETH","WETH","WBTC","MSOL","JITOSOL"]);
const STABLE   = new Set(["USDC","USDT","USDS","DAI","USDH"]);
const MEME     = new Set(["BONK","WIF","BOME","POPCAT","MYRO","SLERF","SAMO","DOGWIFHAT"]);

let cache   = null;
let cacheAt = 0;
const TTL   = 5 * 60 * 1000;
const MIN_TVL   = 50_000;
const MAX_POOLS = 100;

function signal() {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 10_000);
  return ctrl.signal;
}

// Parse pool data from the new analytics API response shape
function parseNewApi(p) {
  const name  = (p?.name ?? p?.pair_name ?? "?-?").toUpperCase();
  const parts = name.split("-");
  const symA  = parts[0] ?? "?";
  const symB  = parts[1] ?? "?";

  const tvl    = Number(p?.tvl ?? p?.liquidity ?? 0);
  const vol24h = Number(p?.volume?.["24h"] ?? p?.trade_volume_24h ?? 0);
  const vol7d  = Number(p?.volume?.["7d"]  ?? p?.trade_volume_7d  ?? 0);

  const feeApr    = Number(p?.fee_apr ?? p?.apr ?? 0);
  const rewardApr = Number(p?.reward_apr?.total ?? 0);
  const totalApr  = feeApr + rewardApr;
  const apyPct    = parseFloat((totalApr < 1 ? totalApr * 100 : totalApr).toFixed(2));

  const hasWarning           = Boolean(p?.has_warning ?? false);
  const lockedLiquidityPct   = Number(p?.locked_liquidity_percent ?? 0);
  const adaptiveFee          = Boolean(p?.is_dynamic_fee ?? p?.adaptive_fee ?? false);
  const feeRate              = Number(p?.base_fee_rate ?? p?.fee_rate ?? 0);
  const poolAddress          = p?.address ?? p?.pool_address ?? p?.pubkey ?? null;

  return {
    symA, symB,
    tvl, vol24h, vol7d, apyPct,
    feeApr, rewardApr,
    hasWarning, lockedLiquidityPct, adaptiveFee, feeRate, poolAddress,
  };
}

// Parse pool data from the legacy API response shape
function parseLegacyApi(p) {
  const name  = (p?.name ?? "?-?").toUpperCase();
  const parts = name.split("-");
  const symA  = parts[0] ?? "?";
  const symB  = parts[1] ?? "?";

  const tvl    = Number(p?.liquidity ?? p?.tvl ?? 0);
  const vol7d  = Number(p?.trade_volume_7d ?? p?.volume7d ?? 0);
  const vol24h = Number(p?.trade_volume_24h ?? 0);

  const feeApr    = Number(p?.apr ?? p?.fee_tvl_ratio ?? 0);
  const rewardApr = Number(p?.reward_apr?.total ?? 0);
  const totalApr  = feeApr + rewardApr;
  const apyPct    = parseFloat((totalApr < 1 ? totalApr * 100 : totalApr).toFixed(2));

  return {
    symA, symB,
    tvl, vol24h, vol7d, apyPct,
    feeApr, rewardApr,
    hasWarning: false, lockedLiquidityPct: 0, adaptiveFee: false,
    feeRate: 0, poolAddress: p?.address ?? null,
  };
}

async function fetchMeteoraPools() {
  if (cache && Date.now() - cacheAt < TTL) return cache;

  let rawPairs = null;
  let useNewApi = false;

  // Try new analytics API first
  try {
    const res = await fetch(
      `https://dlmm.datapi.meteora.ag/pools?limit=${MAX_POOLS}&sort_by=tvl&order=desc&min_tvl=${MIN_TVL}`,
      { headers: { Accept: "application/json" }, signal: signal() }
    );
    if (res.ok) {
      const data = await res.json();
      rawPairs = Array.isArray(data) ? data : data?.data ?? data?.pools ?? [];
      useNewApi = rawPairs.length > 0;
    }
  } catch (err) {
    console.warn("[meteora adapter] new API failed:", err.message);
  }

  // Fallback to legacy API
  if (!rawPairs || rawPairs.length === 0) {
    try {
      const res = await fetch(
        `https://dlmm-api.meteora.ag/pair/all_with_pagination?limit=${MAX_POOLS}&sort_key=tvl&order_by=desc`,
        { headers: { Accept: "application/json" }, signal: signal() }
      );
      if (res.ok) {
        const data = await res.json();
        rawPairs = Array.isArray(data) ? data : data?.data ?? data?.pairs ?? [];
      }
    } catch (err) {
      console.warn("[meteora adapter] legacy API also failed:", err.message);
      return cache ?? [];
    }
  }

  const pools = rawPairs
    .map((p) => {
      const d = useNewApi ? parseNewApi(p) : parseLegacyApi(p);
      const { symA, symB, tvl, vol24h, vol7d, apyPct, feeApr, rewardApr,
              hasWarning, lockedLiquidityPct, adaptiveFee, feeRate, poolAddress } = d;

      const tokens = [symA, symB];
      const isMemePool   = tokens.some((t) => MEME.has(t));
      const isStablePool = tokens.every((t) => STABLE.has(t));
      const isBluechipP  = tokens.every((t) => BLUECHIP.has(t)) && !isMemePool;
      const isUnknown    = tokens.some(
        (t) => !BLUECHIP.has(t) && !STABLE.has(t) && !MEME.has(t) && t !== "?"
      );

      const rewardSource = rewardApr > 0
        ? (feeApr > 0 ? "mixed" : "emissions")
        : "fees";

      let desc = `Provide liquidity ${symA}-${symB} on Meteora DLMM (${apyPct}% APY)`;
      if (hasWarning) desc += " ⚠ WARNING: pool flagged by Meteora";
      if (adaptiveFee) desc += " — adaptive fee pool";

      const urlBase = "https://app.meteora.ag/dlmm";
      const url = poolAddress ? `${urlBase}/${poolAddress}` : urlBase;

      return {
        pair:         `${symA}-${symB}`,
        tvl,
        apy:          apyPct,
        volume24h:    vol24h,
        volume7d:     vol7d,
        tokens,
        isStablePair: isStablePool,
        isBluechip:   isBluechipP,
        isMeme:       isMemePool,
        isUnknown,
        audited:      true,
        rewardSource,
        hasWarning,
        lockedLiquidityPct,
        adaptiveFee,
        feeRate,
        poolAddress,
        protocol:     "Meteora",
        action:       "lp",
        description:  desc,
        url,
      };
    })
    .filter((p) => p.tvl >= MIN_TVL && p.apy > 0);

  if (pools.length > 0) {
    cache   = pools;
    cacheAt = Date.now();
  }

  return pools;
}

module.exports = { fetchMeteoraPools };