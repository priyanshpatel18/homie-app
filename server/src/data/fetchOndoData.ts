/**
 * Ondo USDY data fetcher.
 * USDY is a tokenized US Treasury bill product by Ondo Finance.
 * The token price appreciates daily to reflect T-bill yield (~5% APY).
 *
 * Yield source: CoinGecko price history (calculate from price appreciation)
 *               + DefiLlama as fallback.
 * Solana mint: A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6
 */

const COINGECKO_USDY = "https://api.coingecko.com/api/v3/coins/ondo-us-dollar-yield";
const DEFILLAMA_POOLS = "https://yields.llama.fi/pools";

const MINTS = {
  USDY: "A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6",
};

const FALLBACK = {
  price: 1.05,
  apy: 5.0,
};

let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour (USDY price updates daily)

/**
 * Fetch USDY price from CoinGecko to derive yield.
 */
async function fetchUsdyPrice() {
  const res = await fetch(COINGECKO_USDY, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`CoinGecko USDY ${res.status}`);
  const data = await res.json() as any;
  return data?.market_data?.current_price?.usd ?? null;
}

/**
 * Try to get USDY yield from DefiLlama.
 */
async function fetchUsdyFromDefiLlama() {
  const res = await fetch(DEFILLAMA_POOLS, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`DefiLlama ${res.status}`);

  const data = await res.json() as any;
  const pools = (data?.data ?? []).filter(
    (p) => p.project === "ondo-finance" || (p.symbol ?? "").toUpperCase().includes("USDY"),
  );

  const main = pools.sort((a, b) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0))[0];
  return main ? { apy: main.apy ?? main.apyBase ?? null, tvl: main.tvlUsd ?? null } : null;
}

/**
 * Fetch USDY data with caching.
 */
async function fetchOndoData() {
  if (_cache && Date.now() - _cacheTime < CACHE_TTL) return _cache;

  let price = FALLBACK.price;
  let apy = FALLBACK.apy;
  let tvl = null;

  // Try CoinGecko for price
  try {
    const cgPrice = await fetchUsdyPrice();
    if (cgPrice) {
      price = parseFloat(cgPrice.toFixed(4));
      // USDY started at $1.00 — price appreciation ≈ annualized yield
      // Rough: (price - 1) * 100 gives cumulative yield since inception
      // For current rate, DefiLlama is better
    }
  } catch (err: any) {
    console.warn("[Ondo] CoinGecko fetch failed:", err.message);
  }

  // Try DefiLlama for APY
  try {
    const llama = await fetchUsdyFromDefiLlama();
    if (llama?.apy !== null && llama?.apy !== undefined) {
      apy = parseFloat(llama.apy.toFixed(2));
    }
    if (llama?.tvl) tvl = llama.tvl;
  } catch (err: any) {
    console.warn("[Ondo] DefiLlama fetch failed:", err.message);
  }

  _cache = {
    protocol: "Ondo Finance",
    token: "USDY",
    type: "tokenized US Treasury bills",
    price,
    apy,
    tvlUsd: tvl,
    mints: MINTS,
    riskLevel: "low",
    riskFactors: [
      "US Treasury credit risk (minimal)",
      "Geo-restricted: not available for US persons at mint level",
      "Lower Solana DEX liquidity than major stablecoins — check slippage for large swaps",
      "Redemption to USD requires KYC with Ondo",
    ],
    description: "USDY is backed by short-duration US Treasuries and bank deposits. ~5% APY, accrued through daily price appreciation. Near risk-free profile — ideal for conservative users.",
    link: "https://ondo.finance",
    fetched_at: new Date().toISOString(),
  };
  _cacheTime = Date.now();

  console.log(`[Ondo] USDY price: $${price}, APY: ${apy}%`);
  return _cache;
}

export { fetchOndoData, MINTS as ONDO_MINTS };