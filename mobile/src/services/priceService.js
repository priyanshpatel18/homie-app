/**
 * priceService — portfolio USD value calculator for the client.
 *
 * Prices are fetched from our own backend (/api/prices), which proxies
 * Jupiter Price API v2 with the JUP API key attached server-side.
 * This avoids rate-limits and auth failures when calling Jupiter directly
 * from a mobile client.
 *
 * AbortSignal.timeout() is NOT available on React Native / Hermes,
 * so we use a manual AbortController + setTimeout approach.
 */

import { API_URL } from "./api";

// In-memory cache — 60 s TTL so we don't hammer the backend
const CACHE = { prices: {}, fetchedAt: 0, TTL: 60_000 };

// Stablecoins are always $1 — skip the network call for them
const STABLE_MINTS = new Set([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",  // USDT
]);

const SOL_MINT  = "So11111111111111111111111111111111111111112";
const MSOL_MINT = "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So";

function timeoutSignal(ms) {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

// Binance is a reliable public fallback for SOL price — no API key needed.
async function fetchSolViaBinance() {
  const res = await fetch(
    "https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT",
    { signal: timeoutSignal(5_000) }
  );
  if (!res.ok) throw new Error(`Binance ${res.status}`);
  const price = parseFloat((await res.json()).price);
  if (!(price > 0)) throw new Error("bad price");
  return price;
}

/**
 * Fetch USD prices for an array of mint addresses.
 * Returns { [mint]: price } with stablecoins pre-filled as 1.
 *
 * Strategy:
 *  1. Backend proxy (/api/prices) — uses JUP API key, covers all tokens
 *  2. Binance fallback — for SOL specifically, always available without auth
 */
export async function fetchPricesForMints(mints) {
  const result = {};

  // Stablecoins always $1
  for (const m of mints) {
    if (STABLE_MINTS.has(m)) result[m] = 1.0;
  }

  const nonStable = mints.filter((m) => !STABLE_MINTS.has(m));
  if (!nonStable.length) return result;

  // Return cache if still fresh
  const allCached = nonStable.every((m) => CACHE.prices[m] !== undefined);
  if (allCached && Date.now() - CACHE.fetchedAt < CACHE.TTL) {
    return { ...result, ...CACHE.prices };
  }

  // ── Primary: backend proxy (attaches JUP API key) ──────────────────────────
  let backendOk = false;
  try {
    const res = await fetch(
      `${API_URL}/api/prices?mints=${nonStable.join(",")}`,
      { signal: timeoutSignal(8_000) }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const prices = await res.json(); // { [mint]: priceNumber }

    for (const [mint, price] of Object.entries(prices)) {
      if (price > 0) {
        result[mint]       = price;
        CACHE.prices[mint] = price;
      }
    }
    CACHE.fetchedAt = Date.now();
    backendOk = true;
  } catch (err) {
    console.warn("[priceService] backend fetch failed:", err.message);
  }

  // ── Fallback: Binance for SOL when backend is unavailable ──────────────────
  if (!backendOk && nonStable.includes(SOL_MINT) && !CACHE.prices[SOL_MINT]) {
    try {
      const solPrice = await fetchSolViaBinance();
      result[SOL_MINT]       = solPrice;
      CACHE.prices[SOL_MINT] = solPrice;
      // mSOL ≈ SOL with a small staking premium
      if (nonStable.includes(MSOL_MINT) && !CACHE.prices[MSOL_MINT]) {
        result[MSOL_MINT]       = solPrice * 1.025;
        CACHE.prices[MSOL_MINT] = solPrice * 1.025;
      }
      CACHE.fetchedAt = Date.now();
    } catch (e) {
      console.warn("[priceService] Binance fallback failed:", e.message);
    }
  }

  // Return last cached for anything still missing
  for (const m of nonStable) {
    if (result[m] == null && CACHE.prices[m] > 0) result[m] = CACHE.prices[m];
  }

  return result;
}

/**
 * Compute total portfolio USD value from a fetchPortfolio() response.
 * Returns { totalUsd, solPrice } or null if prices unavailable.
 *
 * Supports both the new Helius DAS response (tokens have usdValue from DAS)
 * and the old RPC response (tokens have no usdValue, need Jupiter price fetch).
 */
export async function calcPortfolioUsd(portfolio) {
  if (!portfolio) return null;

  // Collect all unique mints we need prices for
  const mints = new Set([SOL_MINT]);
  for (const tok of portfolio.tokens || []) {
    if (tok.mint) mints.add(tok.mint);
  }
  // Include position mints (all LSTs, not just mSOL)
  for (const pos of portfolio.positions || []) {
    if (pos.type === "liquid_stake") {
      if (pos.mint) mints.add(pos.mint);
      else mints.add(MSOL_MINT); // backward compat
    }
  }

  const prices = await fetchPricesForMints([...mints]);

  let totalUsd = 0;

  // SOL
  const solPrice = prices[SOL_MINT] || 0;
  totalUsd += (portfolio.solBalance || 0) * solPrice;

  // SPL tokens — prefer server-side usdValue (from DAS), fall back to local price lookup
  for (const tok of portfolio.tokens || []) {
    if (tok.usdValue && tok.usdValue > 0) {
      totalUsd += tok.usdValue;
    } else {
      const price = prices[tok.mint] || 0;
      totalUsd += (tok.balance || 0) * price;
    }
  }

  // Positions: liquid staking (mSOL, jitoSOL, INF, bSOL, etc.)
  for (const pos of portfolio.positions || []) {
    if (pos.type === "liquid_stake") {
      // Prefer server-side usdValue if available
      if (pos.usdValue && pos.usdValue > 0) {
        totalUsd += pos.usdValue;
      } else {
        const lstBal = pos.lstBalance ?? pos.msolBalance ?? 0;
        const lstMint = pos.mint ?? MSOL_MINT;
        const lstPrice = prices[lstMint] || solPrice;
        totalUsd += lstBal * lstPrice;
      }
    }
    // Kamino lending — API already returns USD value per deposit
    if (pos.type === "lending") {
      for (const dep of pos.deposits || []) {
        if (dep.usdValue) totalUsd += dep.usdValue;
      }
    }
  }

  return { totalUsd, solPrice };
}

/**
 * Format a USD value for compact display in the header.
 *   $368.23   (under $10k)
 *   $12.4k    ($10k–$1M)
 *   $1.2M     (over $1M)
 */
export function formatUsd(value) {
  if (!value && value !== 0) return "—";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 10_000)    return `$${(value / 1_000).toFixed(1)}k`;
  return `$${value.toFixed(2)}`;
}
