// @ts-nocheck
/**
 * strategyEngine.js — allocation planner.
 *
 * suggestStrategy(balance, riskPreference, pools, rates)
 *   → { template, allocations, selectedPools, totalExpectedApy, justification }
 *
 * Works in two modes:
 *   1. With live pool data  — selects real pools that match the template
 *   2. Without pool data    — uses fetchRates fallback for known protocols
 */

const { STRATEGY_TEMPLATES } = require("./weights");
const { getRiskAnalysis }     = require("./scorer");
const { detectScam }          = require("./scamDetector");

// ─── Pool selector ────────────────────────────────────────────────────────────

/**
 * Filter and rank pools for a given allocation type and template constraints.
 */
function selectPoolsForType(type, pools, template) {
  const eligible = pools
    .map((pool) => {
      const analysis = getRiskAnalysis(pool);
      const scam     = detectScam(pool);
      return { pool, analysis, scam };
    })
    .filter(({ pool, analysis, scam }) =>
      !scam.isScam &&
      analysis.score >= template.minPoolScore &&
      (template.maxApy === Infinity || (pool?.apy ?? 0) <= template.maxApy)
    );

  // Apply type-specific filters — action field ensures lending pools don't
  // fill LP slots and vice versa.
  const typed = eligible.filter(({ pool }) => {
    switch (type) {
      case "stable_lending":
        return pool.isStablePair && pool.action === "lend";
      case "liquid_stake":
        return pool.action === "stake" && pool.isBluechip && !pool.isMeme;
      case "lp_bluechip":
        return pool.action === "lp" && pool.isBluechip && !pool.isMeme && !pool.isUnknown;
      case "lp_altcoin":
        return pool.action === "lp" && !pool.isStablePair && !pool.isBluechip && !pool.isMeme;
      default:
        return true;
    }
  });

  // Sort by score desc, then APY desc as tiebreaker
  typed.sort((a, b) =>
    b.analysis.score !== a.analysis.score
      ? b.analysis.score - a.analysis.score
      : (b.pool.apy ?? 0) - (a.pool.apy ?? 0)
  );

  return typed.slice(0, 3); // top 3 per type
}

// ─── Fallback pools from known protocols ─────────────────────────────────────
// Used when live pool data is unavailable — constructed from fetchRates output.

function buildFallbackPools(rates) {
  const pools = [];

  if (rates?.marinade_apy) {
    pools.push({
      pair: "mSOL (Marinade)",
      tvl: 800_000_000,  // ~$800M TVL historically
      apy: rates.marinade_apy,
      volume7d: 50_000_000,
      tokens: ["SOL", "mSOL"],
      isStablePair: false,
      isBluechip: true,
      isMeme: false,
      isUnknown: false,
      audited: true,
      rewardSource: "fees",
      protocol: "Marinade Finance",
      action: "stake",
      description: `Liquid stake SOL → mSOL (${rates.marinade_apy}% APY)`,
      url: "https://marinade.finance",
    });
  }

  if (rates?.kamino_usdc_lending_apy) {
    pools.push({
      pair: "USDC Lending (Kamino)",
      tvl: 200_000_000,
      apy: rates.kamino_usdc_lending_apy,
      volume7d: 30_000_000,
      tokens: ["USDC"],
      isStablePair: true,
      isBluechip: true,
      isMeme: false,
      isUnknown: false,
      audited: true,
      rewardSource: "fees",
      protocol: "Kamino Finance",
      action: "lend",
      description: `Lend USDC on Kamino (${rates.kamino_usdc_lending_apy}% APY)`,
      url: "https://app.kamino.finance",
    });
  }

  if (rates?.kamino_sol_lending_apy) {
    pools.push({
      pair: "SOL Lending (Kamino)",
      tvl: 150_000_000,
      apy: rates.kamino_sol_lending_apy,
      volume7d: 20_000_000,
      tokens: ["SOL"],
      isStablePair: false,
      isBluechip: true,
      isMeme: false,
      isUnknown: false,
      audited: true,
      rewardSource: "fees",
      protocol: "Kamino Finance",
      action: "lend",
      description: `Lend SOL on Kamino (${rates.kamino_sol_lending_apy}% APY)`,
      url: "https://app.kamino.finance",
    });
  }

  if (rates?.kamino_sol_usdc_lp_apy) {
    pools.push({
      pair: "SOL-USDC LP (Kamino)",
      tvl: 50_000_000,
      apy: rates.kamino_sol_usdc_lp_apy,
      volume7d: 15_000_000,
      tokens: ["SOL", "USDC"],
      isStablePair: false,
      isBluechip: true,
      isMeme: false,
      isUnknown: false,
      audited: true,
      rewardSource: "mixed",
      protocol: "Kamino Finance",
      action: "lp",
      description: `Provide liquidity SOL-USDC on Kamino (${rates.kamino_sol_usdc_lp_apy}% APY)`,
      url: "https://app.kamino.finance",
    });
  }

  // Orca SOL-USDC as alternative LP option
  pools.push({
    pair: "SOL-USDC Whirlpool (Orca)",
    tvl: 12_000_000,
    apy: rates?.orca_sol_usdc_apy ?? 14.0,
    volume7d: 4_000_000,
    tokens: ["SOL", "USDC"],
    isStablePair: false,
    isBluechip: true,
    isMeme: false,
    isUnknown: false,
    audited: true,
    rewardSource: "fees",
    protocol: "Orca",
    action: "lp",
    description: `Provide liquidity SOL-USDC on Orca Whirlpool (~14% APY)`,
    url: "https://www.orca.so",
  });

  return pools;
}

// ─── Weighted APY calculator ──────────────────────────────────────────────────

function calcWeightedApy(allocations) {
  return allocations.reduce((sum, a) => sum + (a.expectedApy ?? 0) * a.pct, 0);
}

// ─── Justification builder ────────────────────────────────────────────────────

function buildJustification(template, riskPreference, allocations, totalApy) {
  const lines = [
    `${template.label} strategy selected for ${riskPreference} risk preference.`,
    template.description + ".",
  ];

  for (const alloc of allocations) {
    if (alloc.pool) {
      lines.push(
        `${Math.round(alloc.pct * 100)}% → ${alloc.pool.pair}: ` +
        `${alloc.pool.apy}% APY (risk score ${alloc.poolScore}/100, ${alloc.analysis?.risk} risk)`
      );
    } else {
      lines.push(`${Math.round(alloc.pct * 100)}% → ${alloc.label}: held as liquid reserve`);
    }
  }

  lines.push(`Blended expected APY: ${totalApy.toFixed(2)}%`);
  return lines;
}

// ─── Main entrypoint ──────────────────────────────────────────────────────────

/**
 * @param {number} balance           — total USD to allocate
 * @param {"low"|"medium"|"high"} riskPreference
 * @param {Object[]} [pools]         — live pool list (optional)
 * @param {Object}   [rates]         — fetchRates() output (fallback)
 * @returns {Object} allocation plan
 */
function suggestStrategy(balance, riskPreference, pools = [], rates = {}) {
  if (!["low", "medium", "high"].includes(riskPreference)) {
    throw new Error(`Invalid riskPreference: ${riskPreference}. Use "low", "medium", or "high".`);
  }

  const template    = STRATEGY_TEMPLATES[riskPreference];
  const sourcePools = pools.length > 0 ? pools : buildFallbackPools(rates);

  const allocations = template.allocations.map((slot) => {
    if (slot.type === "cash") {
      return {
        ...slot,
        usdAmount:   Math.round(balance * slot.pct),
        expectedApy: 0,
        pool:        null,
        poolScore:   null,
        analysis:    null,
        rationale:   "Kept liquid as a reserve for gas fees and rapid reallocation",
      };
    }

    // Find best pool for this slot
    const candidates = selectPoolsForType(slot.type, sourcePools, template);
    const best       = candidates[0];

    if (!best) {
      // No eligible pool found — fallback to cash
      return {
        ...slot,
        usdAmount:   Math.round(balance * slot.pct),
        expectedApy: 0,
        pool:        null,
        poolScore:   null,
        analysis:    null,
        rationale:   `No eligible pool found for ${slot.label} at this risk level — held as reserve`,
      };
    }

    return {
      ...slot,
      usdAmount:   Math.round(balance * slot.pct),
      expectedApy: best.pool.apy ?? 0,
      pool:        best.pool,
      poolScore:   best.analysis.score,
      analysis:    best.analysis,
      rationale:   best.analysis.reasons[0] ?? `Score ${best.analysis.score}/100`,
    };
  });

  const totalExpectedApy = calcWeightedApy(allocations);
  const justification    = buildJustification(template, riskPreference, allocations, totalExpectedApy);

  return {
    riskPreference,
    template:  template.label,
    balance,
    allocations: allocations.map((a) => ({
      label:       a.label,
      pct:         a.pct,
      usdAmount:   a.usdAmount,
      expectedApy: a.expectedApy,
      pool:        a.pool ? {
        pair:        a.pool.pair,
        protocol:    a.pool.protocol,
        apy:         a.pool.apy,
        tvl:         a.pool.tvl,
        rewardSource: a.pool.rewardSource,
        action:      a.pool.action,
        description: a.pool.description,
        url:         a.pool.url,
        riskScore:   a.poolScore,
        riskLabel:   a.analysis?.risk,
      } : null,
      rationale: a.rationale,
    })),
    totalExpectedApy: parseFloat(totalExpectedApy.toFixed(2)),
    annualYieldUsd:   parseFloat((balance * totalExpectedApy / 100).toFixed(2)),
    justification,
  };
}

module.exports = { suggestStrategy, buildFallbackPools };