/**
 * pnlService — compute PnL for trades stored in chatStorage.
 *
 * Strategy per action type:
 *   swap   → outputAmount * currentOutputPrice - inputAmount * entryInputPrice
 *   stake  → estimate yield from elapsed time + approximate mSOL APY (~7%)
 *   lend   → estimate yield from elapsed time + approximate lending APY
 *   other  → show entry value only (no current price known)
 */

import { listTrades } from "./chatStorage";
import { API_URL } from "./api";

const STAKE_APY_FALLBACK = 0.07;
const LEND_APY_FALLBACK  = 0.05;

let _ratesCache = null;
let _ratesCacheTime = 0;
const RATES_TTL = 5 * 60 * 1000;

async function getLiveRates() {
  if (_ratesCache && Date.now() - _ratesCacheTime < RATES_TTL) return _ratesCache;
  try {
    const res = await fetch(`${API_URL}/api/rates`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`rates ${res.status}`);
    _ratesCache = await res.json();
    _ratesCacheTime = Date.now();
    return _ratesCache;
  } catch {
    return null;
  }
}

/**
 * Parse a number out of strings like "~7.2 mSOL", "149.5 USDC", "1.5"
 */
function parseAmount(str) {
  if (!str) return null;
  const n = parseFloat(str.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? null : n;
}

function daysSince(isoDate) {
  return (Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24);
}

/**
 * Compute PnL for a single trade given current token prices.
 *
 * @param {object} trade  — stored trade object from chatStorage
 * @param {object} prices — { [symbol_or_mint]: priceUsd }
 * @returns {{ entryUsd, currentUsd, pnlUsd, pnlPct, label, daysHeld } | null}
 */
export function computeTradePnL(trade, prices = {}, liveRates = null) {
  const {
    inputToken, inputAmount, inputPriceUsd,
    outputToken, outputAmount,
    executedAt, action = "",
  } = trade;

  const actionLower = action.toLowerCase();
  const days = daysSince(executedAt);

  const stakeApy = liveRates?.marinade_apy
    ? liveRates.marinade_apy / 100
    : STAKE_APY_FALLBACK;

  const lendApy = liveRates?.kamino_sol_lending_apy
    ? liveRates.kamino_sol_lending_apy / 100
    : LEND_APY_FALLBACK;

  // ── Staking (SOL → mSOL) ──────────────────────────────────────────────────
  if (actionLower.includes("stake") && inputAmount && inputPriceUsd) {
    const entryUsd   = inputAmount * inputPriceUsd;
    const yieldFrac  = stakeApy * (days / 365);
    const earnedUsd  = entryUsd * yieldFrac;
    const currentUsd = entryUsd + earnedUsd;
    return {
      entryUsd, currentUsd,
      pnlUsd:  earnedUsd,
      pnlPct:  yieldFrac * 100,
      label:   "Staking yield",
      daysHeld: Math.floor(days),
      earnedPerDay: entryUsd * (stakeApy / 365),
    };
  }

  // ── Lending (SOL/USDC → kToken) ───────────────────────────────────────────
  if ((actionLower.includes("lend") || actionLower.includes("deposit")) && inputAmount && inputPriceUsd) {
    const entryUsd   = inputAmount * inputPriceUsd;
    const yieldFrac  = lendApy * (days / 365);
    const earnedUsd  = entryUsd * yieldFrac;
    const currentUsd = entryUsd + earnedUsd;
    return {
      entryUsd, currentUsd,
      pnlUsd:  earnedUsd,
      pnlPct:  yieldFrac * 100,
      label:   "Lending yield",
      daysHeld: Math.floor(days),
      earnedPerDay: entryUsd * (lendApy / 365),
    };
  }

  // ── Swap (tokenA → tokenB) ────────────────────────────────────────────────
  if (actionLower.includes("swap") && outputToken && outputAmount) {
    const currentPrice = prices[outputToken?.toUpperCase()] ?? prices[outputToken] ?? null;
    if (!currentPrice || !inputPriceUsd || !inputAmount) return null;

    const entryUsd   = inputAmount * inputPriceUsd;
    const currentUsd = outputAmount * currentPrice;
    const pnlUsd     = currentUsd - entryUsd;
    return {
      entryUsd, currentUsd,
      pnlUsd,
      pnlPct:  (pnlUsd / entryUsd) * 100,
      label:   `${outputToken} position`,
      daysHeld: Math.floor(days),
      earnedPerDay: null,
    };
  }

  return null;
}

/**
 * Load all trades and compute aggregate PnL stats.
 *
 * @param {string} walletAddress
 * @param {object} prices — { [symbol]: priceUsd }
 * @returns {{ trades, totalEntryUsd, totalCurrentUsd, totalPnlUsd, totalPnlPct, winRate }}
 */
export async function getPortfolioPnL(walletAddress, prices = {}) {
  const [trades, liveRates] = await Promise.all([
    listTrades(walletAddress),
    getLiveRates(),
  ]);
  if (!trades.length) return null;

  let totalEntryUsd   = 0;
  let totalCurrentUsd = 0;
  let winners = 0;
  let computed = 0;

  const enriched = trades.map((t) => {
    const pnl = computeTradePnL(t, prices, liveRates);
    if (pnl) {
      totalEntryUsd   += pnl.entryUsd;
      totalCurrentUsd += pnl.currentUsd;
      if (pnl.pnlUsd > 0) winners++;
      computed++;
      return { ...t, pnl };
    }
    return { ...t, pnl: null };
  });

  const totalPnlUsd = totalCurrentUsd - totalEntryUsd;
  const totalPnlPct = totalEntryUsd > 0 ? (totalPnlUsd / totalEntryUsd) * 100 : 0;

  return {
    trades: enriched,
    totalEntryUsd,
    totalCurrentUsd,
    totalPnlUsd,
    totalPnlPct,
    winRate: computed > 0 ? (winners / computed) * 100 : 0,
    tradeCount: trades.length,
    computedCount: computed,
  };
}

/**
 * Quick summary string for a single recently-confirmed trade.
 * Used to show "you'll earn ~$0.08/day on this" right after execution.
 */
export function tradeInsightText(trade) {
  const pnl = computeTradePnL(trade, {});
  if (!pnl) return null;
  if (pnl.earnedPerDay != null) {
    const daily = pnl.earnedPerDay.toFixed(3);
    const yearly = (pnl.earnedPerDay * 365).toFixed(0);
    return `this position earns ~$${daily}/day — about $${yearly}/yr at current rates.`;
  }
  return null;
}
