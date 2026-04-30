// @ts-nocheck
/**
 * weights.js — single source of truth for all scoring constants.
 *
 * Every numeric threshold lives here so the model can be tuned without
 * touching evaluation logic. Values are informed by observed Solana DeFi
 * behaviour (Kamino, Orca, Meteora data, Q1-Q2 2024).
 */

// ─── Component maximums (must sum to 100) ─────────────────────────────────────
const MAX_SCORES = {
  tvl:          25,
  apy:          20,
  tokens:       20,
  volume:       15,
  protocol:     10,
  rewardSource: 10,
};

// ─── TVL tiers (USD) ──────────────────────────────────────────────────────────
const TVL_TIERS = [
  { min: 100_000_000, score: 25 },  // $100M+  — blue-chip depth
  { min:  10_000_000, score: 22 },  // $10M+   — institutional grade
  { min:   1_000_000, score: 18 },  // $1M+    — solid retail pool
  { min:     250_000, score: 13 },  // $250k+  — acceptable
  { min:      50_000, score:  7 },  // $50k+   — risky
  { min:      10_000, score:  3 },  // $10k+   — very risky
  { min:           0, score:  0 },  // <$10k   — avoid
];

// ─── APY tiers (%) ────────────────────────────────────────────────────────────
const APY_TIERS = [
  { max:  10, score: 20 },  // ≤10%   — sustainable real yield
  { max:  25, score: 17 },  // ≤25%   — healthy elevated
  { max:  50, score: 12 },  // ≤50%   — elevated, monitor closely
  { max: 100, score:  6 },  // ≤100%  — high risk of collapse
  { max: 200, score:  2 },  // ≤200%  — almost certainly unsustainable
  { max: Infinity, score: 0 }, // >200% — rug territory
];

// Multiplier applied to APY score based on reward source
const REWARD_SOURCE_MULTIPLIER = {
  fees:      1.00,  // Pure trading fees — sustainable
  mixed:     0.80,  // Fees + some emissions — moderate sustainability
  emissions: 0.55,  // Pure token inflation — will collapse when rewards end
};

// ─── Volume/TVL ratio tiers (weekly) ─────────────────────────────────────────
// Healthy pool: ~5-100% of TVL traded per week
const VOLUME_RATIO_TIERS = [
  { min: 0.20,  max: 1.00, score: 15 },  // Active, healthy utilisation
  { min: 0.05,  max: 0.20, score: 11 },  // Moderate activity
  { min: 0.01,  max: 0.05, score:  6 },  // Low but real
  { min: 1.00,  max: 3.00, score: 10 },  // Very high — plausible for volatile pair
  { min: 3.00,  max: Infinity, score: 4 }, // Suspicious: possible wash trading
  { min: 0,     max: 0.01, score:  2 },  // Near-zero — illiquid
];

// ─── Token composition scores ─────────────────────────────────────────────────
const TOKEN_SCORES = {
  stable:         20,  // USDC/USDT/USDS — no price risk
  bluechipOnly:   16,  // SOL/BTC/ETH/wBTC — correlated, trustworthy
  altcoin:        10,  // Mid-cap, known project
  meme:            4,  // High volatility, narrative-driven
  unknown:         0,  // Not on major aggregators
};

// ─── Impermanent loss penalties ───────────────────────────────────────────────
const IL_PENALTY = {
  stable:    0,   // Pegged assets — no IL
  bluechip:  5,   // Correlated but can diverge
  altcoin:  10,   // Standard IL risk
  meme:     18,   // Severe IL risk on spike/crash
  unknown:  20,   // Unknown price behaviour
};

// ─── Protocol trust ───────────────────────────────────────────────────────────
const PROTOCOL_SCORE = {
  audited:     10,
  notAudited:   0,
};

// ─── Reward source (standalone component) ─────────────────────────────────────
const REWARD_SOURCE_SCORE = {
  fees:      10,
  mixed:      6,
  emissions:  2,
};

// ─── Scam detection thresholds ────────────────────────────────────────────────
const SCAM = {
  honeyPot:        { apyMin: 500,  tvlMax: 100_000 },
  washTrading:     { apyMin: 50,   volTvlRatioMax: 0.001 },
  rugRisk:         { apyMin: 200,  tvlMax: 500_000 },
  tvlSpikeRatio:   3.0,   // 3× TVL in 24h → suspicious
  unknownHighApy:  100,   // Unknown token + APY > 100% = flag
};

// ─── Risk classification boundaries ──────────────────────────────────────────
const RISK_BANDS = {
  low:    { min: 75, label: "Low Risk"    },
  medium: { min: 45, label: "Medium Risk" },
  high:   { min:  0, label: "High Risk"   },
};

// ─── Strategy allocation templates ───────────────────────────────────────────
const STRATEGY_TEMPLATES = {
  low: {
    label: "Conservative",
    description: "Stable yields with minimal volatility exposure",
    minPoolScore: 72,
    maxApy:       20,
    allocations: [
      { type: "stable_lending",  pct: 0.50, label: "Stablecoin lending" },
      { type: "liquid_stake",    pct: 0.40, label: "Liquid SOL staking"  },
      { type: "cash",            pct: 0.10, label: "Liquid reserve"      },
    ],
  },
  medium: {
    label: "Balanced",
    description: "Mix of safe yields and higher-return opportunities",
    minPoolScore: 50,
    maxApy:       60,
    allocations: [
      { type: "stable_lending",  pct: 0.35, label: "Stablecoin lending" },
      { type: "liquid_stake",    pct: 0.30, label: "Liquid SOL staking"  },
      { type: "lp_bluechip",    pct: 0.25, label: "Bluechip LP"         },
      { type: "cash",            pct: 0.10, label: "Liquid reserve"      },
    ],
  },
  high: {
    label: "Growth",
    description: "Maximise yield, accept higher volatility and IL risk",
    minPoolScore: 35,
    maxApy:       Infinity,
    allocations: [
      { type: "lp_bluechip",    pct: 0.40, label: "Bluechip LP"         },
      { type: "stable_lending",  pct: 0.25, label: "Stablecoin lending" },
      { type: "liquid_stake",    pct: 0.20, label: "Liquid SOL staking"  },
      { type: "lp_altcoin",     pct: 0.15, label: "Altcoin LP"          },
    ],
  },
};

module.exports = {
  MAX_SCORES,
  TVL_TIERS,
  APY_TIERS,
  REWARD_SOURCE_MULTIPLIER,
  VOLUME_RATIO_TIERS,
  TOKEN_SCORES,
  IL_PENALTY,
  PROTOCOL_SCORE,
  REWARD_SOURCE_SCORE,
  SCAM,
  RISK_BANDS,
  STRATEGY_TEMPLATES,
};