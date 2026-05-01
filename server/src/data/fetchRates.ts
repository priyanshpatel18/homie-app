/**
 * Live rate fetcher — real APYs only, no static fallbacks.
 * If a source is down the field is null so the agent knows data is unavailable.
 */

import { fetchJitoData } from "./fetchJitoData";
import { fetchSanctumData } from "./fetchSanctumData";
import { fetchMarginfiBanks } from "./fetchMarginfiData";
import { fetchEthenaData } from "./fetchEthenaData";
import { fetchOndoData } from "./fetchOndoData";
import { env } from "../config/env";

type Rates = Record<string, number | null | string>;

let _cache: Rates | null = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

const toApy = (v: unknown): number | null => {
  if (v == null) return null;
  const n = parseFloat(String(v));
  if (isNaN(n)) return null;
  return parseFloat((n < 1 ? n * 100 : n).toFixed(2));
};

// ─── Marinade ───────────────────────────────────────────────────────────────

async function fetchMarinadeApy(): Promise<number> {
  const res = await fetch("https://api.marinade.finance/msol/apy/24h", {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Marinade API ${res.status}`);
  const data = await res.json() as Record<string, unknown>;
  const raw = data.value ?? data.apy ?? null;
  if (raw == null) throw new Error("Marinade: unexpected response shape");
  return toApy(raw)!;
}

// ─── Kamino lending ──────────────────────────────────────────────────────────

async function fetchKaminoLendingRates() {
  const res = await fetch(
    "https://api.kamino.finance/kamino-market/7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF/reserves/metrics",
    { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) }
  );
  if (!res.ok) throw new Error(`Kamino reserves/metrics ${res.status}`);
  const data = await res.json() as unknown;
  const reserves: any[] = Array.isArray(data)
    ? data
    : ((data as any).reserves ?? (data as any).data ?? []);

  const sol = reserves.find((r: any) => r.symbol === "SOL");
  const usdc = reserves.find((r: any) => r.symbol === "USDC");
  return {
    sol_lending_apy: toApy(sol?.supplyInterestAPY),
    usdc_lending_apy: toApy(usdc?.supplyInterestAPY),
  };
}

// ─── Kamino LP (SOL/USDC strategy) ──────────────────────────────────────────

async function fetchKaminoLpApy(): Promise<number | null> {
  const res = await fetch("https://api.kamino.finance/strategies/", {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Kamino strategies ${res.status}`);
  const data = await res.json() as unknown;
  const list: any[] = Array.isArray(data)
    ? data
    : ((data as any).strategies ?? (data as any).data ?? []);

  const strategy = list.find((s: any) => {
    const a = (s.tokenA ?? s.tokenASymbol ?? "").toUpperCase();
    const b = (s.tokenB ?? s.tokenBSymbol ?? "").toUpperCase();
    return (a === "SOL" && b === "USDC") || (a === "USDC" && b === "SOL");
  });
  if (!strategy) throw new Error("SOL/USDC strategy not found");
  const apy = strategy.apy ?? strategy.totalApy ?? null;
  if (apy == null) throw new Error("No APY on SOL/USDC strategy");
  return toApy(apy);
}

// ─── Jupiter Lend ────────────────────────────────────────────────────────────

async function fetchJupLendRates() {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (env.JUP_API_KEY) headers.Authorization = `Bearer ${env.JUP_API_KEY}`;

  const res = await fetch("https://api.jup.ag/lend/v1/earn/tokens", {
    headers,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Jupiter Lend API ${res.status}`);
  const data = await res.json() as unknown;
  const tokens: any[] = Array.isArray(data)
    ? data
    : ((data as any).tokens ?? (data as any).data ?? []);

  const sol = tokens.find((t: any) => t.symbol === "SOL");
  const usdc = tokens.find((t: any) => t.symbol === "USDC");
  return {
    sol_apy: toApy(sol?.supplyAPY ?? sol?.totalApy),
    usdc_apy: toApy(usdc?.supplyAPY ?? usdc?.totalApy),
  };
}

// ─── SOL price ───────────────────────────────────────────────────────────────

async function fetchSolPrice(): Promise<number> {
  const SOL = "So11111111111111111111111111111111111111112";
  const res = await fetch(`https://api.jup.ag/price/v2?ids=${SOL}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Jupiter price API ${res.status}`);
  const data = await res.json() as { data?: Record<string, { price?: string }> };
  const price = data?.data?.[SOL]?.price;
  if (!price) throw new Error("No SOL price in response");
  return parseFloat(parseFloat(price).toFixed(2));
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function fetchLiveRates(): Promise<Rates> {
  if (_cache && Date.now() - _cacheTime < CACHE_TTL_MS) return _cache;

  const [
    marinadeRes, kaminoLendRes, kaminoLpRes,
    jupLendRes, jitoRes, sanctumRes,
    marginfiRes, ethenaRes, ondoRes, solPriceRes,
  ] = await Promise.allSettled([
    fetchMarinadeApy(),
    fetchKaminoLendingRates(),
    fetchKaminoLpApy(),
    fetchJupLendRates(),
    fetchJitoData(),
    fetchSanctumData(),
    fetchMarginfiBanks(),
    fetchEthenaData(),
    fetchOndoData(),
    fetchSolPrice(),
  ]);

  const ok = <T>(r: PromiseSettledResult<T>): T | null =>
    r.status === "fulfilled"
      ? r.value
      : (console.error("[rates]", (r.reason as Error)?.message), null);

  const marinade  = ok(marinadeRes);
  const kaminoLend = ok(kaminoLendRes);
  const kaminoLp  = ok(kaminoLpRes);
  const jupLend   = ok(jupLendRes);
  const jito      = ok(jitoRes) as any;
  const sanctum   = ok(sanctumRes) as any;
  const marginfi  = ok(marginfiRes) as any[];
  const ethena    = ok(ethenaRes) as any;
  const ondo      = ok(ondoRes) as any;
  const solPrice  = ok(solPriceRes);

  let marginfiSolApy: number | null = null;
  let marginfiUsdcApy: number | null = null;
  if (Array.isArray(marginfi)) {
    const solBank  = marginfi.find((b: any) => b.symbol === "SOL");
    const usdcBank = marginfi.find((b: any) => b.symbol === "USDC");
    marginfiSolApy  = solBank?.supplyApy  ?? null;
    marginfiUsdcApy = usdcBank?.supplyApy ?? null;
  }

  _cache = {
    marinade_apy:             marinade,
    marinade_native_apy:      marinade != null ? parseFloat((marinade - 0.4).toFixed(2)) : null,
    kamino_sol_lending_apy:   kaminoLend?.sol_lending_apy  ?? null,
    kamino_usdc_lending_apy:  kaminoLend?.usdc_lending_apy ?? null,
    kamino_sol_usdc_lp_apy:   kaminoLp,
    jitosol_apy:              jito?.jitosol_apy   ?? null,
    sanctum_inf_apy:          sanctum?.inf_apy    ?? null,
    jup_lend_sol_apy:         jupLend?.sol_apy    ?? null,
    jup_lend_usdc_apy:        jupLend?.usdc_apy   ?? null,
    marginfi_sol_supply_apy:  marginfiSolApy,
    marginfi_usdc_supply_apy: marginfiUsdcApy,
    susde_apy:                ethena?.apy  ?? null,
    usdy_apy:                 ondo?.apy    ?? null,
    usdy_price:               ondo?.price  ?? null,
    sol_price_usd:            solPrice,
    fetched_at:               new Date().toISOString(),
  };
  _cacheTime = Date.now();

  console.log("[rates] fetched:", _cache);
  return _cache;
}

export { fetchLiveRates };
