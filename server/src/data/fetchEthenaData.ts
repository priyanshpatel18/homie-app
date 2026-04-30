/**
 * Ethena sUSDe yield data fetcher.
 * sUSDe is Ethena's staked USDe — a delta-neutral synthetic dollar earning
 * yield from perpetual futures funding rates.
 *
 * Yield source: DefiLlama pools API (most reliable public source).
 * Solana mints verified from docs.ethena.fi:
 *   USDe:  DEkqHyPN7GMRJ5cArtQFAWefqbZb33Hyf6s5iCwjEonT
 *   sUSDe: Eh6XEPhSwoLv5wFApukmnaVSHQ6sAnoD9BmgmwQoN2sN
 */

const DEFILLAMA_POOLS = "https://yields.llama.fi/pools";

const MINTS = {
  USDe:  "DEkqHyPN7GMRJ5cArtQFAWefqbZb33Hyf6s5iCwjEonT",
  sUSDe: "Eh6XEPhSwoLv5wFApukmnaVSHQ6sAnoD9BmgmwQoN2sN",
};

const FALLBACK = {
  apy: 15.0,
  tvl: 3_000_000_000,
};

let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 min

/**
 * Fetch sUSDe staking APY from DefiLlama.
 */
async function fetchEthenaData() {
  if (_cache && Date.now() - _cacheTime < CACHE_TTL) return _cache;

  let apy = FALLBACK.apy;
  let tvl = FALLBACK.tvl;

  try {
    const res = await fetch(DEFILLAMA_POOLS, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) throw new Error(`DefiLlama ${res.status}`);

    const data = await res.json() as any;
    const pools = (data?.data ?? []).filter(
      (p) => p.project === "ethena" && (p.symbol ?? "").toUpperCase().includes("SUSDE"),
    );

    // Pick the main sUSDe staking pool (highest TVL)
    const main = pools.sort((a, b) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0))[0];

    if (main) {
      const rawApy = main.apy ?? main.apyBase ?? null;
      if (rawApy !== null) apy = parseFloat(rawApy.toFixed(2));
      if (main.tvlUsd) tvl = main.tvlUsd;
    }
  } catch (err: any) {
    console.warn("[Ethena] DefiLlama fetch failed, using fallback:", err.message);
  }

  _cache = {
    protocol: "Ethena",
    token: "sUSDe",
    type: "delta-neutral synthetic dollar",
    apy,
    tvlUsd: tvl,
    mints: MINTS,
    riskLevel: "medium",
    riskFactors: [
      "Funding rate can go negative (rare) — yield drops or goes slightly negative temporarily",
      "Smart contract risk (ERC-4626 vault + LayerZero bridge)",
      "Custodial risk on centralized exchange hedges",
      "Not FDIC insured or government-backed",
    ],
    description: "sUSDe earns yield from perpetual futures funding rates via a delta-neutral strategy. Typically 10-20%+ APY but variable. Higher risk than T-bill backed stablecoins.",
    link: "https://app.ethena.fi",
    fetched_at: new Date().toISOString(),
  };
  _cacheTime = Date.now();

  console.log(`[Ethena] sUSDe APY: ${apy}%`);
  return _cache;
}

export { fetchEthenaData, MINTS as ETHENA_MINTS };