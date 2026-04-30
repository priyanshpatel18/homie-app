/**
 * marginfi data fetcher.
 * Pulls bank (lending pool) metadata and rates from marginfi's public APIs.
 * Falls back to DefiLlama if the primary source is unavailable.
 */

const MARGINFI_BANKS_URL =
  "https://storage.googleapis.com/mrgn-public/mrgn-bank-metadata-cache.json";
const DEFILLAMA_POOLS_URL = "https://yields.llama.fi/pools";

// Cache for 5 minutes
let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

// Well-known token mints for matching
const KNOWN_MINTS = {
  So11111111111111111111111111111111111111112: "SOL",
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
  mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: "mSOL",
  J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn: "jitoSOL",
  "7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj": "stSOL",
  bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1: "bSOL",
};

function normApy(raw) {
  if (raw == null) return null;
  const n = parseFloat(raw);
  if (isNaN(n)) return null;
  return parseFloat((n < 1 ? n * 100 : n).toFixed(2));
}

/**
 * Try to fetch marginfi bank data from their public cache.
 */
async function fetchFromMarginfiApi() {
  const res = await fetch(MARGINFI_BANKS_URL, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`marginfi bank cache ${res.status}`);

  const raw = await res.json() as any;
  const banks = Array.isArray(raw) ? raw : raw?.banks ?? raw?.data ?? [];

  return banks.map((b) => {
    const mint = b.mint ?? b.tokenMint ?? b.token_mint ?? null;
    const symbol =
      (b.symbol ?? b.tokenSymbol ?? b.token_symbol ?? KNOWN_MINTS[mint] ?? "")
        .toUpperCase();

    return {
      symbol,
      name: b.name ?? b.tokenName ?? symbol,
      mint,
      bankAddress: b.address ?? b.bankAddress ?? b.bank_address ?? null,
      supplyApy: normApy(b.lending_rate ?? b.lendingRate ?? b.supply_apy ?? b.supplyApy),
      borrowApy: normApy(b.borrow_rate ?? b.borrowRate ?? b.borrow_apy ?? b.borrowApy),
      totalDeposits: b.total_deposits ?? b.totalDeposits ?? null,
      totalDepositsUsd: b.total_deposits_usd ?? b.totalDepositsUsd ?? null,
      totalBorrows: b.total_borrows ?? b.totalBorrows ?? null,
      utilizationRate: b.utilization ?? b.utilization_rate ?? null,
      riskTier: b.risk_tier ?? b.riskTier ?? null,
    };
  });
}

/**
 * Fallback: pull marginfi pool data from DefiLlama.
 */
async function fetchFromDefiLlama() {
  const res = await fetch(DEFILLAMA_POOLS_URL, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`DefiLlama pools ${res.status}`);

  const data = await res.json() as any;
  const pools = (data?.data ?? []).filter(
    (p) =>
      p.project === "marginfi" &&
      p.chain === "Solana",
  );

  return pools.map((p) => ({
    symbol: (p.symbol ?? "").split("-")[0].toUpperCase(),
    name: p.symbol ?? "",
    mint: null,
    bankAddress: p.pool ?? null,
    supplyApy: p.apyBase != null ? parseFloat(p.apyBase.toFixed(2)) : null,
    borrowApy: p.apyBaseBorrow != null ? parseFloat(p.apyBaseBorrow.toFixed(2)) : null,
    totalDeposits: null,
    totalDepositsUsd: p.tvlUsd ?? null,
    totalBorrows: null,
    utilizationRate: null,
    riskTier: null,
  }));
}

/**
 * Static fallback when all APIs fail.
 */
function staticFallback() {
  return [
    { symbol: "SOL",  supplyApy: 3.5, borrowApy: 6.2, totalDepositsUsd: 500_000_000 },
    { symbol: "USDC", supplyApy: 8.0, borrowApy: 11.5, totalDepositsUsd: 400_000_000 },
    { symbol: "USDT", supplyApy: 7.5, borrowApy: 10.8, totalDepositsUsd: 150_000_000 },
    { symbol: "mSOL", supplyApy: 4.2, borrowApy: 7.0, totalDepositsUsd: 80_000_000 },
  ].map((b) => ({ ...b, name: b.symbol, mint: null, bankAddress: null, totalDeposits: null, totalBorrows: null, utilizationRate: null, riskTier: null }));
}

/**
 * Fetch marginfi bank data with caching and multi-source fallback.
 */
async function fetchMarginfiBanks() {
  if (_cache && Date.now() - _cacheTime < CACHE_TTL) return _cache;

  let banks = [];
  try {
    banks = await fetchFromMarginfiApi();
    if (banks.length > 0) {
      console.log(`[marginfi] fetched ${banks.length} banks from API`);
    }
  } catch (err: any) {
    console.warn("[marginfi] primary API failed:", err.message);
  }

  if (banks.length === 0) {
    try {
      banks = await fetchFromDefiLlama();
      console.log(`[marginfi] fetched ${banks.length} pools from DefiLlama`);
    } catch (err: any) {
      console.warn("[marginfi] DefiLlama fallback failed:", err.message);
    }
  }

  if (banks.length === 0) {
    banks = staticFallback();
    console.warn("[marginfi] using static fallback data");
  }

  _cache = banks;
  _cacheTime = Date.now();
  return banks;
}

/**
 * Get a summary for the agent.
 */
async function fetchMarginfiData() {
  const banks = await fetchMarginfiBanks();

  // Sort by supply APY descending
  const sorted = [...banks]
    .filter((b) => b.supplyApy !== null)
    .sort((a, b) => (b.supplyApy ?? 0) - (a.supplyApy ?? 0));

  return {
    protocol: "marginfi",
    totalBanks: banks.length,
    topBanks: sorted.slice(0, 10),
    allBanks: sorted,
    fetched_at: new Date().toISOString(),
  };
}

export { fetchMarginfiBanks, fetchMarginfiData };