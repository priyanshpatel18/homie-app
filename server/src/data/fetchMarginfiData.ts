/**
 * marginfi data — pulls live rates from DeFiLlama (primary) then
 * marginfi's public bank cache. No static fallbacks.
 */

let _cache: any = null;
let _cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

function normApy(raw: any): number | null {
  if (raw == null) return null;
  const n = parseFloat(raw);
  if (isNaN(n)) return null;
  return parseFloat((n < 1 ? n * 100 : n).toFixed(2));
}

async function fetchFromDefiLlama() {
  const res = await fetch("https://yields.llama.fi/pools", {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`DeFiLlama pools ${res.status}`);
  const data = await res.json() as any;
  const pools = (data?.data ?? []).filter(
    (p: any) => p.project === "marginfi" && p.chain === "Solana"
  );
  if (pools.length === 0) throw new Error("No marginfi pools in DeFiLlama response");
  return pools.map((p: any) => ({
    symbol: (p.symbol ?? "").split("-")[0].toUpperCase(),
    name: p.symbol ?? "",
    mint: null,
    bankAddress: p.pool ?? null,
    supplyApy: p.apyBase != null ? parseFloat(p.apyBase.toFixed(2)) : null,
    borrowApy: p.apyBaseBorrow != null ? parseFloat(p.apyBaseBorrow.toFixed(2)) : null,
    totalDepositsUsd: p.tvlUsd ?? null,
  }));
}

async function fetchFromMarginfiApi() {
  const res = await fetch(
    "https://storage.googleapis.com/mrgn-public/mrgn-bank-metadata-cache.json",
    { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) }
  );
  if (!res.ok) throw new Error(`marginfi bank cache ${res.status}`);
  const raw = await res.json() as any;
  const banks = Array.isArray(raw) ? raw : raw?.banks ?? raw?.data ?? [];
  if (banks.length === 0) throw new Error("Empty marginfi bank response");

  const KNOWN_MINTS: Record<string, string> = {
    So11111111111111111111111111111111111111112: "SOL",
    EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
    Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
    mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: "mSOL",
    J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn: "jitoSOL",
  };

  return banks.map((b: any) => {
    const mint = b.mint ?? b.tokenMint ?? b.token_mint ?? null;
    const symbol = (b.symbol ?? b.tokenSymbol ?? KNOWN_MINTS[mint] ?? "").toUpperCase();
    return {
      symbol,
      name: b.name ?? b.tokenName ?? symbol,
      mint,
      bankAddress: b.address ?? b.bankAddress ?? null,
      supplyApy: normApy(b.lending_rate ?? b.lendingRate ?? b.supply_apy ?? b.supplyApy),
      borrowApy: normApy(b.borrow_rate ?? b.borrowRate ?? b.borrow_apy ?? b.borrowApy),
      totalDepositsUsd: b.total_deposits_usd ?? b.totalDepositsUsd ?? null,
    };
  });
}

async function fetchMarginfiBanks() {
  if (_cache && Date.now() - _cacheTime < CACHE_TTL) return _cache;

  // DeFiLlama is primary per user preference (no SDK required)
  try {
    const banks = await fetchFromDefiLlama();
    console.log(`[marginfi] ${banks.length} pools from DeFiLlama`);
    _cache = banks;
    _cacheTime = Date.now();
    return banks;
  } catch (err: any) {
    console.warn("[marginfi] DeFiLlama failed, trying marginfi API:", err.message);
  }

  const banks = await fetchFromMarginfiApi();
  console.log(`[marginfi] ${banks.length} banks from marginfi API`);
  _cache = banks;
  _cacheTime = Date.now();
  return banks;
}

async function fetchMarginfiData() {
  const banks = await fetchMarginfiBanks();
  const sorted = [...banks]
    .filter((b: any) => b.supplyApy !== null)
    .sort((a: any, b: any) => (b.supplyApy ?? 0) - (a.supplyApy ?? 0));
  return {
    protocol: "marginfi",
    totalBanks: banks.length,
    topBanks: sorted.slice(0, 10),
    allBanks: sorted,
    fetched_at: new Date().toISOString(),
  };
}

export { fetchMarginfiBanks, fetchMarginfiData };
