/**
 * Fetch live Sanctum data:
 * - INF APY (Infinity Pool yield)
 * - Sanctum LST list with APYs
 * - Sanctum pool TVL
 *
 * Falls back to static values if APIs are unavailable.
 */

const SANCTUM_API_BASE = process.env.SANCTUM_API_URL
  || "https://sanctum-s-api.fly.dev/v1";

const SANCTUM_API_KEY = process.env.SANCTUM_API_KEY || "";

const FALLBACKS = {
  inf_apy: 7.5,
  inf_tvl_usd: 500_000_000,
};

// Cache for 5 minutes
let cache = null;
let cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

function sanctumHeaders() {
  const h = {
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
  if (SANCTUM_API_KEY) h["Authorization"] = `Bearer ${SANCTUM_API_KEY}`;
  return h;
}

/**
 * Fetch INF APY from Sanctum API.
 */
async function fetchInfApy() {
  try {
    // Try Sanctum's LST APY endpoint for INF
    const INF_MINT = "5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm";
    const res = await fetch(`${SANCTUM_API_BASE}/lsts/${INF_MINT}/apys`, {
      headers: sanctumHeaders(),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) throw new Error(`Sanctum APY API ${res.status}`);

    const data = await res.json() as any;

    // APY can be nested in various shapes
    const apy = data.apy ?? data.estimated_apy ?? data.total_apy
      ?? data?.apys?.total ?? data?.apys?.staking ?? null;

    if (apy === null) throw new Error("No APY in response");

    return apy < 1 ? parseFloat((apy * 100).toFixed(2)) : parseFloat(apy.toFixed(2));
  } catch (err: any) {
    console.warn("[Sanctum INF APY] API failed:", err.message);

    // Fallback: try DeFiLlama
    try {
      const llamaRes = await fetch(
        "https://yields.llama.fi/pools",
        { signal: AbortSignal.timeout(8000) }
      );
      if (llamaRes.ok) {
        const llamaData = await llamaRes.json() as any;
        const pools = llamaData.data ?? [];
        const infPool = pools.find(
          (p) => p.symbol?.toUpperCase()?.includes("INF") && p.project?.toLowerCase()?.includes("sanctum")
        );
        if (infPool?.apy) {
          return parseFloat(infPool.apy.toFixed(2));
        }
      }
    } catch { /* ignore */ }

    return FALLBACKS.inf_apy;
  }
}

/**
 * Fetch Sanctum LST catalog with metadata.
 * Returns top LSTs by TVL with their APYs.
 */
async function fetchSanctumLsts() {
  try {
    const res = await fetch(`${SANCTUM_API_BASE}/lsts`, {
      headers: sanctumHeaders(),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) throw new Error(`Sanctum LST list ${res.status}`);

    const data = await res.json() as any;
    const lsts = Array.isArray(data) ? data : data.lsts ?? data.data ?? [];

    return lsts.map((lst) => ({
      symbol: lst.symbol ?? lst.ticker ?? "?",
      name: lst.name ?? "",
      mint: lst.mint ?? lst.address ?? "",
      apy: lst.apy ?? lst.estimated_apy ?? null,
      tvl: lst.tvl ?? null,
    }));
  } catch (err: any) {
    console.warn("[Sanctum LSTs] fetch failed:", err.message);
    // Return well-known LSTs as fallback
    return [
      { symbol: "INF", name: "Sanctum Infinity", mint: "5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm", apy: FALLBACKS.inf_apy },
      { symbol: "jitoSOL", name: "Jito Staked SOL", mint: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn", apy: 7.8 },
      { symbol: "mSOL", name: "Marinade Staked SOL", mint: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So", apy: 7.2 },
      { symbol: "bSOL", name: "BlazeStake SOL", mint: "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1", apy: 7.0 },
    ];
  }
}

/**
 * Fetch all Sanctum data with caching.
 */
async function fetchSanctumData() {
  if (cache && Date.now() - cacheTime < CACHE_TTL_MS) {
    return cache;
  }

  const [infApyResult, lstsResult] = await Promise.allSettled([
    fetchInfApy(),
    fetchSanctumLsts(),
  ]);

  const infApy = infApyResult.status === "fulfilled" ? infApyResult.value : FALLBACKS.inf_apy;
  const lsts = lstsResult.status === "fulfilled" ? lstsResult.value : [];

  cache = {
    inf_apy: infApy,
    lsts_count: lsts.length,
    top_lsts: lsts.slice(0, 20),
    fetched_at: new Date().toISOString(),
  };
  cacheTime = Date.now();

  console.log("[Sanctum Data] fetched:", { inf_apy: infApy, lsts_count: lsts.length });
  return cache;
}

export { fetchSanctumData, fetchInfApy, fetchSanctumLsts };