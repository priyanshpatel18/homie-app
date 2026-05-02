/**
 * Forward-looking yield projector.
 * Given an amount, APY, and protocol, projects portfolio value over 30/60/90 days
 * across three SOL price scenarios: bull (+30%), base (flat), bear (-30%).
 */

import { fetchLiveRates } from "./fetchRates";

export interface ScenarioResult {
  label: "bull" | "base" | "bear";
  solMultiplier: number;
  solPriceUsd: number;
  startUsd: number;
  endUsd: number;
  yieldUsd: number;
  yieldNative: number;
  dailyUsd: number;
  vsHoldingUsd: number; // staking end value minus just-holding-SOL end value
}

export interface ProjectionResult {
  protocol: string;
  action: string;
  amountSol: number | null;
  amountUsd: number;
  apy: number;
  days: number;
  currentSolPrice: number;
  scenarios: {
    bull: ScenarioResult;
    base: ScenarioResult;
    bear: ScenarioResult;
  };
}

const SCENARIO_MULTIPLIERS = {
  bull: 1.3,
  base: 1.0,
  bear: 0.7,
} as const;

function calcScenario(
  label: "bull" | "base" | "bear",
  amountSol: number | null,
  amountUsd: number,
  apy: number,
  days: number,
  currentSolPrice: number,
): ScenarioResult {
  const multiplier = SCENARIO_MULTIPLIERS[label];
  const projectedSolPrice = currentSolPrice * multiplier;

  // Yield fraction over the period
  const yieldFrac = (apy / 100) * (days / 365);

  // Native yield (in the staked/lent token — approximated as same denomination)
  const yieldNative = amountSol != null
    ? amountSol * yieldFrac                // SOL strategies: yield in SOL
    : (amountUsd / currentSolPrice) * yieldFrac; // USD strategies: approximate

  // End USD value: principal × scenario price factor + yield in USD
  let endUsd: number;
  if (amountSol != null) {
    // SOL-denominated strategy: principal re-prices with SOL
    const principalUsd = amountSol * projectedSolPrice;
    const yieldUsd = yieldNative * projectedSolPrice;
    endUsd = principalUsd + yieldUsd;
  } else {
    // USD-denominated strategy (stablecoins): principal stays in USD
    endUsd = amountUsd * (1 + yieldFrac);
  }

  const startUsd = amountSol != null ? amountSol * currentSolPrice : amountUsd;
  const yieldUsd = endUsd - (amountSol != null ? amountSol * projectedSolPrice : amountUsd);
  const dailyUsd = yieldUsd / days;

  // Opportunity cost vs just holding SOL
  const holdingEndUsd = amountSol != null ? amountSol * projectedSolPrice : amountUsd;
  const vsHoldingUsd = endUsd - holdingEndUsd;

  return {
    label,
    solMultiplier: multiplier,
    solPriceUsd: parseFloat(projectedSolPrice.toFixed(2)),
    startUsd: parseFloat(startUsd.toFixed(2)),
    endUsd: parseFloat(endUsd.toFixed(2)),
    yieldUsd: parseFloat(yieldUsd.toFixed(2)),
    yieldNative: parseFloat(yieldNative.toFixed(6)),
    dailyUsd: parseFloat(dailyUsd.toFixed(4)),
    vsHoldingUsd: parseFloat(vsHoldingUsd.toFixed(2)),
  };
}

export async function projectYield(params: {
  amountSol?: number;
  amountUsd?: number;
  apy: number;
  protocol: string;
  action: string;
  days: 30 | 60 | 90;
}): Promise<ProjectionResult> {
  const rates = await fetchLiveRates().catch(() => null);
  const currentSolPrice = (rates as any)?.sol_price_usd ?? 150;

  // Resolve amount
  let amountSol: number | null = null;
  let amountUsd: number;

  if (params.amountSol != null) {
    amountSol = params.amountSol;
    amountUsd = amountSol * currentSolPrice;
  } else if (params.amountUsd != null) {
    amountUsd = params.amountUsd;
    // For non-SOL strategies (USDC staking etc.), don't re-price with SOL
    amountSol = null;
  } else {
    throw new Error("projectYield: provide amountSol or amountUsd");
  }

  const { apy, protocol, action, days } = params;

  return {
    protocol,
    action,
    amountSol,
    amountUsd: parseFloat(amountUsd.toFixed(2)),
    apy,
    days,
    currentSolPrice: parseFloat(currentSolPrice.toFixed(2)),
    scenarios: {
      bull: calcScenario("bull", amountSol, amountUsd, apy, days, currentSolPrice),
      base: calcScenario("base", amountSol, amountUsd, apy, days, currentSolPrice),
      bear: calcScenario("bear", amountSol, amountUsd, apy, days, currentSolPrice),
    },
  };
}
