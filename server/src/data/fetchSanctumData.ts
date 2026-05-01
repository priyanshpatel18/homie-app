/**
 * Fetch live Sanctum data.
 * INF APY is derived from the INF/SOL exchange rate tracked over time
 * (Jupiter price API). Falls back to DeFiLlama when history is insufficient.
 */

const INF_MINT = "5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm";
const SOL_MINT = "So11111111111111111111111111111111111111112";

// Ring buffer of rate snapshots — survives across 5-min cache cycles
const rateHistory: { rate: number; ts: number }[] = [];
const MAX_HISTORY = 10_000; // keep up to ~35 days at 5-min intervals

let _cache: any = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchInfSolRate(): Promise<number> {
  const res = await fetch(
    `https://price.jup.ag/v6/price?ids=${INF_MINT}&vsToken=${SOL_MINT}`,
    { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) }
  );
  if (!res.ok) throw new Error(`Jupiter price API ${res.status}`);
  const data = await res.json() as any;
  const rate = data?.data?.[INF_MINT]?.price;
  if (!rate) throw new Error("No INF/SOL rate in response");
  return parseFloat(rate);
}

function apyFromHistory(): number | null {
  if (rateHistory.length < 2) return null;
  const newest = rateHistory[rateHistory.length - 1];
  // Prefer a reference point ~7 days ago; fall back to oldest available
  const targetTs = newest.ts - 7 * 24 * 60 * 60 * 1000;
  const ref = rateHistory.find(r => r.ts <= targetTs) ?? rateHistory[0];
  const daysDiff = (newest.ts - ref.ts) / 86_400_000;
  if (daysDiff < 0.5) return null; // need at least 12 h of data
  const apy = ((newest.rate / ref.rate) ** (365 / daysDiff) - 1) * 100;
  return parseFloat(apy.toFixed(2));
}

async function infApyFromDefiLlama(): Promise<number | null> {
  const res = await fetch("https://yields.llama.fi/pools", {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`DeFiLlama pools ${res.status}`);
  const data = await res.json() as any;
  const pool = (data?.data ?? []).find(
    (p: any) => p.chain === "Solana" &&
      (p.project?.toLowerCase().includes("sanctum") || p.symbol?.toUpperCase().includes("INF"))
  );
  if (!pool?.apy) return null;
  return parseFloat(pool.apy.toFixed(2));
}

async function fetchSanctumLsts() {
  const SANCTUM_API_KEY = process.env.SANCTUM_API_KEY ?? "";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (SANCTUM_API_KEY) headers.Authorization = `Bearer ${SANCTUM_API_KEY}`;

  const res = await fetch("https://sanctum-s-api.fly.dev/v1/lsts", {
    headers,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Sanctum LST list ${res.status}`);
  const data = await res.json() as any;
  const lsts = Array.isArray(data) ? data : data.lsts ?? data.data ?? [];
  return lsts.map((lst: any) => ({
    symbol: lst.symbol ?? lst.ticker ?? "?",
    name: lst.name ?? "",
    mint: lst.mint ?? lst.address ?? "",
    apy: lst.apy != null ? (lst.apy < 1 ? parseFloat((lst.apy * 100).toFixed(2)) : parseFloat(lst.apy.toFixed(2))) : null,
    tvl: lst.tvl ?? null,
  }));
}

async function fetchSanctumData() {
  if (_cache && Date.now() - _cacheTime < CACHE_TTL_MS) return _cache;

  // Always try to record a fresh rate snapshot
  try {
    const rate = await fetchInfSolRate();
    rateHistory.push({ rate, ts: Date.now() });
    if (rateHistory.length > MAX_HISTORY) rateHistory.shift();
  } catch (err: any) {
    console.error("[Sanctum] rate fetch failed:", err.message);
  }

  // Compute APY from history; if insufficient, try DeFiLlama
  let infApy = apyFromHistory();
  if (infApy === null) {
    try {
      infApy = await infApyFromDefiLlama();
      console.log(`[Sanctum] using DeFiLlama APY: ${infApy}%`);
    } catch (err: any) {
      console.error("[Sanctum] DeFiLlama APY failed:", err.message);
    }
  }

  const lstsResult = await Promise.allSettled([fetchSanctumLsts()]);
  const lsts = lstsResult[0].status === "fulfilled" ? lstsResult[0].value : [];
  if (lstsResult[0].status === "rejected") {
    console.error("[Sanctum] LST list failed:", (lstsResult[0].reason as Error).message);
  }

  _cache = {
    inf_apy: infApy,
    lsts_count: lsts.length,
    top_lsts: lsts.slice(0, 20),
    fetched_at: new Date().toISOString(),
  };
  _cacheTime = Date.now();
  return _cache;
}

export { fetchSanctumData, fetchInfSolRate, fetchSanctumLsts };
