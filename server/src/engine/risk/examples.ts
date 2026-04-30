// @ts-nocheck
/**
 * examples.js — run this directly to verify the engine output.
 * node src/engine/risk/examples.js
 */

const { analysePool, analyseAllPools, suggestStrategy } = require("./index");

// ─── Example pools ────────────────────────────────────────────────────────────

const POOLS = {
  // Should score HIGH (safe)
  kaminoUsdcLend: {
    pair: "USDC Lending", tvl: 180_000_000, apy: 7.8, volume7d: 22_000_000,
    tokens: ["USDC"], isStablePair: true, isBluechip: true, isMeme: false,
    isUnknown: false, audited: true, rewardSource: "fees",
    protocol: "Kamino Finance", action: "lend",
    description: "Lend USDC on Kamino", url: "https://app.kamino.finance",
  },

  // Should score MEDIUM
  orcaSolUsdc: {
    pair: "SOL-USDC", tvl: 8_000_000, apy: 18.4, volume7d: 2_500_000,
    tokens: ["SOL","USDC"], isStablePair: false, isBluechip: true, isMeme: false,
    isUnknown: false, audited: true, rewardSource: "mixed",
    protocol: "Orca", action: "lp",
    description: "SOL-USDC Whirlpool", url: "https://www.orca.so",
  },

  // Should score LOW (risky)
  memeCoin: {
    pair: "WIF-SOL", tvl: 400_000, apy: 320, volume7d: 80_000,
    tokens: ["WIF","SOL"], isStablePair: false, isBluechip: false, isMeme: true,
    isUnknown: false, audited: false, rewardSource: "emissions",
    protocol: "Unknown DEX", action: "lp",
    description: "WIF-SOL meme pool", url: "",
  },

  // Should trigger SCAM flags
  scamPool: {
    pair: "RUGME-SOL", tvl: 45_000, apy: 8500, volume7d: 100,
    tokens: ["RUGME","SOL"], isStablePair: false, isBluechip: false, isMeme: false,
    isUnknown: true, audited: false, rewardSource: "emissions",
    protocol: "ShadySwap", action: "lp",
    description: "RUGME farm", url: "",
  },
};

function printAnalysis(name, result) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`Pool: ${name}`);
  console.log(`Score: ${result.score}/100  |  Risk: ${result.label}`);
  console.log(`\nBreakdown:`);
  for (const [k, v] of Object.entries(result.breakdown)) {
    const bar = v >= 0 ? "▓".repeat(Math.max(0, v)) : "░".repeat(Math.abs(v));
    console.log(`  ${k.padEnd(14)} ${String(v).padStart(4)}  ${bar}`);
  }
  if (result.reasons.length) {
    console.log(`\n✅ Reasons:`);
    result.reasons.forEach((r) => console.log(`  • ${r}`));
  }
  if (result.warnings.length) {
    console.log(`\n⚠️  Warnings:`);
    result.warnings.forEach((w) => console.log(`  • ${w}`));
  }
  if (result.scam.isScam) {
    console.log(`\n🚨 SCAM DETECTED (confidence: ${result.scam.confidence}):`);
    result.scam.scamReasons.forEach((r) => console.log(`  ‼ ${r}`));
  }
}

function printStrategy(plan) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`Strategy: ${plan.template} | Balance: $${plan.balance.toLocaleString()}`);
  console.log(`Expected APY: ${plan.totalExpectedApy}% | Annual yield: $${plan.annualYieldUsd}`);
  console.log(`\nAllocations:`);
  for (const a of plan.allocations) {
    console.log(`  ${String(Math.round(a.pct * 100)).padStart(3)}%  $${a.usdAmount.toLocaleString().padEnd(8)}  ${a.label}`);
    if (a.pool) {
      console.log(`         → ${a.pool.pair} (${a.pool.apy}% APY, score ${a.pool.riskScore}/100)`);
    }
  }
  console.log(`\nJustification:`);
  plan.justification.forEach((l) => console.log(`  ${l}`));
}

// ─── Run examples ─────────────────────────────────────────────────────────────

console.log("DeFi Risk Engine — Example Output");
console.log("=".repeat(60));

for (const [name, pool] of Object.entries(POOLS)) {
  printAnalysis(name, analysePool(pool));
}

// Strategy suggestions (using fallback rates — no live API needed)
const mockRates = {
  marinade_apy: 7.1,
  kamino_sol_lending_apy: 4.2,
  kamino_usdc_lending_apy: 8.1,
  kamino_sol_usdc_lp_apy: 16.4,
};

console.log(`\n${"═".repeat(60)}`);
console.log("STRATEGY SUGGESTIONS\n");

for (const pref of ["low", "medium", "high"]) {
  const plan = suggestStrategy(10_000, pref, [], mockRates);
  printStrategy(plan);
}