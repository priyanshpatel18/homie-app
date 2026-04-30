// @ts-nocheck
/**
 * adapters/kamino.js — fetches Kamino pool + vault data and normalises it
 * into the standard Pool shape expected by the risk engine.
 *
 * Endpoints used:
 *   Lending markets: GET https://api.kamino.finance/kamino-market  (list of markets)
 *                    GET https://api.kamino.finance/v2/lending-market/:market/reserves
 *   LP strategies:   GET https://api.kamino.finance/strategies/metrics?env=mainnet-beta&status=LIVE
 *
 * Note: /kvaults/vaults returns single-token yield vaults (no pairs).
 *       /strategies/metrics returns concentrated-liquidity LP strategies with
 *       tokenA/tokenB symbols, real TVL, and APY already computed.
 *       APY values in the response are decimals (0.05 = 5%) — multiply by 100.
 *
 * Cache: 5 minutes.
 */

const BLUECHIP_SYMBOLS = new Set(["SOL","USDC","USDT","ETH","WETH","WBTC","BTC","MSOL","JITOSOL"]);
const STABLE_SYMBOLS   = new Set(["USDC","USDT","USDS","DAI","USDH","UXD"]);

let cache    = null;
let cacheAt  = 0;
const TTL_MS = 5 * 60 * 1000;

function signal() {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 8_000);
  return ctrl.signal;
}

function isBluechip(tokens) {
  return tokens.every((t) => BLUECHIP_SYMBOLS.has(t.toUpperCase()));
}

function isStable(tokens) {
  return tokens.every((t) => STABLE_SYMBOLS.has(t.toUpperCase()));
}

// ── Lending reserves → Pool objects ──────────────────────────────────────────
// Endpoint: GET /kamino-market/{market}/reserves/metrics
// Returns all reserves with supplyApy, borrowApy, totalSupplyUsd as decimal strings.
const MAIN_MARKET = "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF";

async function fetchLendingPools() {
  const res = await fetch(
    `https://api.kamino.finance/kamino-market/${MAIN_MARKET}/reserves/metrics`,
    { headers: { Accept: "application/json" }, signal: signal() }
  );
  if (!res.ok) throw new Error(`Kamino reserves/metrics HTTP ${res.status}`);
  const data = await res.json();

  return data
    .filter((r) => parseFloat(r.totalSupplyUsd) >= 100_000)
    .sort((a, b) => parseFloat(b.totalSupplyUsd) - parseFloat(a.totalSupplyUsd))
    .map((r) => {
      const symbol = (r.liquidityToken ?? "UNKNOWN").toUpperCase();
      // supplyApy is a decimal string — 0.04 = 4%
      const apyPct = parseFloat((parseFloat(r.supplyApy) * 100).toFixed(2));
      const tvl    = parseFloat(r.totalSupplyUsd);

      return {
        pair:         `${symbol} Lending`,
        tvl,
        apy:          apyPct,
        volume7d:     parseFloat(r.totalBorrowUsd) || tvl * 0.1,
        tokens:       [symbol],
        isStablePair: STABLE_SYMBOLS.has(symbol),
        isBluechip:   BLUECHIP_SYMBOLS.has(symbol),
        isMeme:       false,
        isUnknown:    !BLUECHIP_SYMBOLS.has(symbol) && !STABLE_SYMBOLS.has(symbol),
        audited:      true,
        rewardSource: "fees",
        protocol:     "Kamino Finance",
        action:       "lend",
        description:  `Lend ${symbol} on Kamino (${apyPct}% APY)`,
        url:          "https://app.kamino.finance",
      };
    });
}

// ── LP strategies → Pool objects ──────────────────────────────────────────────
// Uses /strategies/metrics which returns concentrated-liquidity LP strategies
// with real tokenA/tokenB symbols, TVL, and APY (in decimal form).
async function fetchVaultPools() {
  const res = await fetch(
    "https://api.kamino.finance/strategies/metrics?env=mainnet-beta&status=LIVE",
    { headers: { Accept: "application/json" }, signal: signal() }
  );
  if (!res.ok) throw new Error(`Kamino strategies HTTP ${res.status}`);
  const data = await res.json();

  return data
    .filter((s) => parseFloat(s.totalValueLocked) >= 50_000)
    .sort((a, b) => parseFloat(b.totalValueLocked) - parseFloat(a.totalValueLocked))
    .slice(0, 60) // top 60 by TVL
    .map((s) => {
      const symA  = (s.tokenA || "?").toUpperCase();
      const symB  = (s.tokenB || "?").toUpperCase();
      const pair  = `${symA}-${symB}`;
      const tokens = [symA, symB];
      const tvl   = parseFloat(s.totalValueLocked);

      // APY is a decimal in this API (0.05 = 5%) — multiply by 100
      const rawApy  = parseFloat(s.kaminoApy?.totalApy ?? s.apy?.vault?.totalApy ?? 0);
      const apyPct  = parseFloat((rawApy * 100).toFixed(2));

      const hasRewards = (s.rewardMints?.length ?? 0) > 0 || (s.krewardMints?.length ?? 0) > 0;
      const rewardSource = hasRewards ? "mixed" : "fees";

      return {
        pair,
        tvl,
        apy:          apyPct,
        volume7d:     tvl * 0.15, // volume not returned by API — estimate from TVL
        tokens,
        isStablePair: isStable(tokens),
        isBluechip:   isBluechip(tokens),
        isMeme:       false,
        isUnknown:    tokens.some((t) => !BLUECHIP_SYMBOLS.has(t) && !STABLE_SYMBOLS.has(t)),
        audited:      true,
        rewardSource,
        protocol:     "Kamino Finance",
        action:       "lp",
        address:      s.strategy,
        description:  `Provide liquidity ${pair} on Kamino (${apyPct}% APY)`,
        url:          `https://app.kamino.finance/liquidity/${s.strategy}`,
      };
    })
    .filter((p) => p.tvl > 0);
}

// ── Public: fetch all Kamino pools with cache ─────────────────────────────────
async function fetchKaminoPools() {
  if (cache && Date.now() - cacheAt < TTL_MS) return cache;

  const [lending, vaults] = await Promise.allSettled([
    fetchLendingPools(),
    fetchVaultPools(),
  ]);

  const pools = [
    ...(lending.status === "fulfilled" ? lending.value : []),
    ...(vaults.status  === "fulfilled" ? vaults.value  : []),
  ];

  if (pools.length > 0) {
    cache   = pools;
    cacheAt = Date.now();
  }

  return pools;
}

module.exports = { fetchKaminoPools };