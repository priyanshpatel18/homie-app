// @ts-nocheck
/**
 * risk/index.js — public API for the DeFi Risk Evaluation Engine.
 *
 * Exports:
 *   analysePool(pool)                              → full analysis + scam check
 *   analyseAllPools([pools])                       → ranked list
 *   suggestStrategy(balance, risk, [pools], rates) → allocation plan
 *   fetchAllPools()                                → live data from all adapters
 *
 * Also exports individual primitives for direct use:
 *   getRiskAnalysis, classifyRisk, evaluatePool, detectScam
 */

const { getRiskAnalysis, classifyRisk, evaluatePool } = require("./scorer");
const { detectScam }    = require("./scamDetector");
const { suggestStrategy, buildFallbackPools } = require("./strategyEngine");
const { fetchKaminoPools }  = require("./adapters/kamino");
const { fetchOrcaPools }    = require("./adapters/orca");
const { fetchMeteoraPools } = require("./adapters/meteora");

// ─── Fetch all live pools from all adapters ───────────────────────────────────

async function fetchAllPools() {
  const [kamino, orca, meteora] = await Promise.allSettled([
    fetchKaminoPools(),
    fetchOrcaPools(),
    fetchMeteoraPools(),
  ]);

  return [
    ...(kamino.status  === "fulfilled" ? kamino.value  : []),
    ...(orca.status    === "fulfilled" ? orca.value    : []),
    ...(meteora.status === "fulfilled" ? meteora.value : []),
  ];
}

// ─── Single pool full analysis ────────────────────────────────────────────────

function analysePool(pool, historical = []) {
  const riskAnalysis = getRiskAnalysis(pool);
  const scamAnalysis = detectScam(pool, historical);

  // If scam signals fire, cap the risk score at 30
  const finalScore = scamAnalysis.isScam
    ? Math.min(riskAnalysis.score, 30)
    : riskAnalysis.score;
  const finalRisk  = classifyRisk(finalScore);

  return {
    pool: {
      pair:         pool.pair,
      protocol:     pool.protocol,
      tvl:          pool.tvl,
      apy:          pool.apy,
      volume7d:     pool.volume7d,
      rewardSource: pool.rewardSource,
      action:       pool.action,
      description:  pool.description,
      url:          pool.url,
    },
    score:    finalScore,
    risk:     finalRisk,
    label:    finalRisk === "low" ? "Low Risk" : finalRisk === "medium" ? "Medium Risk" : "High Risk",
    reasons:  riskAnalysis.reasons,
    warnings: [
      ...riskAnalysis.warnings,
      ...(scamAnalysis.isScam ? ["⚠️ SCAM/RUG SIGNALS DETECTED — avoid this pool"] : []),
    ],
    breakdown: riskAnalysis.breakdown,
    scam:      scamAnalysis,
  };
}

// ─── Bulk analysis with ranking ───────────────────────────────────────────────

function analyseAllPools(pools, historical = {}) {
  return pools
    .map((pool) => analysePool(pool, historical[pool.pair] ?? []))
    .sort((a, b) => b.score - a.score); // highest score (safest) first
}

// ─── Express route handler (wire into index.js) ───────────────────────────────
// Usage: app.use("/api/risk", require("./src/engine/risk").riskRouter)

const express = require("express");
const riskRouter = express.Router();
const { fetchLiveRates } = require("../../data/fetchRates");

// GET /api/risk/pools — all live pools, scored and ranked
riskRouter.get("/pools", async (req, res) => {
  try {
    const [pools, rates] = await Promise.all([fetchAllPools(), fetchLiveRates()]);
    const analyses = analyseAllPools(pools.length > 0 ? pools : buildFallbackPools(rates));
    res.json({ count: analyses.length, pools: analyses });
  } catch (err) {
    console.error("[risk/pools]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/risk/analyse — analyse a single pool payload
riskRouter.post("/analyse", (req, res) => {
  try {
    const pool = req.body;
    if (!pool?.pair) return res.status(400).json({ error: "pool.pair is required" });
    res.json(analysePool(pool));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/risk/strategy — suggest allocation plan
riskRouter.post("/strategy", async (req, res) => {
  try {
    const { balance, riskPreference } = req.body;
    if (!balance || !riskPreference) {
      return res.status(400).json({ error: "balance and riskPreference are required" });
    }

    const [pools, rates] = await Promise.all([fetchAllPools(), fetchLiveRates()]);
    const plan = suggestStrategy(
      Number(balance),
      riskPreference,
      pools,
      rates,
    );
    res.json(plan);
  } catch (err) {
    console.error("[risk/strategy]", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = {
  // Core functions
  analysePool,
  analyseAllPools,
  suggestStrategy,
  fetchAllPools,
  // Primitives
  getRiskAnalysis,
  classifyRisk,
  evaluatePool,
  detectScam,
  // Express router
  riskRouter,
};