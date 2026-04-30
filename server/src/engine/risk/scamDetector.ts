// @ts-nocheck
/**
 * scamDetector.js — heuristic rug/scam signal detection.
 *
 * detectScam(pool, historical?) → { isScam, confidence, scamReasons }
 *
 * Operates in two modes:
 *   1. Static  — only current pool snapshot (always available)
 *   2. Dynamic — uses historical TVL snapshots when provided
 *
 * Confidence: "low" | "medium" | "high"
 * isScam is set true when ANY high-confidence signal fires,
 * or when ≥2 medium-confidence signals fire together.
 */

const { SCAM } = require("./weights");

// ─── Individual signal detectors ─────────────────────────────────────────────

/**
 * Honey pot: extremely high APY + very low TVL.
 * Real pools with $50k TVL don't generate 1000% APY from fees.
 */
function detectHoneyPot(pool) {
  const { apy, tvl, rewardSource } = pool;
  if (apy >= SCAM.honeyPot.apyMin && tvl <= SCAM.honeyPot.tvlMax) {
    return {
      fired: true,
      confidence: "high",
      reason: `Honey-pot pattern: ${apy}% APY with only $${(tvl/1000).toFixed(0)}k TVL — ` +
              `no real pool generates this yield at this liquidity level`,
    };
  }
  return { fired: false };
}

/**
 * Ghost volume: near-zero weekly volume despite high APY claim.
 * Real yield from fees requires real trades.
 */
function detectGhostVolume(pool) {
  const { apy, tvl, volume7d } = pool;
  const ratio = tvl > 0 ? volume7d / tvl : 0;
  if (apy >= SCAM.washTrading.apyMin && ratio < SCAM.washTrading.volTvlRatioMax) {
    return {
      fired: true,
      confidence: "high",
      reason: `High APY (${apy}%) but near-zero 7d volume ($${(volume7d/1000).toFixed(1)}k) — ` +
              `fee-based yield at this APY requires substantial trading activity`,
    };
  }
  return { fired: false };
}

/**
 * Rug setup: high APY + low TVL + unaudited + meme/unknown token.
 * Classic soft-rug setup: attract liquidity, drain or abandon.
 */
function detectRugSetup(pool) {
  const { apy, tvl, audited, isMeme, isUnknown } = pool;
  const suspiciousToken = isMeme || isUnknown;

  if (apy >= SCAM.rugRisk.apyMin && tvl <= SCAM.rugRisk.tvlMax && !audited && suspiciousToken) {
    return {
      fired: true,
      confidence: "high",
      reason: `Rug-pull risk profile: ${apy}% APY, ${isMeme ? "meme" : "unknown"} token, ` +
              `unaudited contracts, TVL under $${(SCAM.rugRisk.tvlMax/1000).toFixed(0)}k — ` +
              `all classic preconditions for a soft rug`,
    };
  }
  return { fired: false };
}

/**
 * Unknown token with high APY — token value can be set to zero at any time.
 */
function detectUnknownHighApy(pool) {
  const { apy, isUnknown, tokens } = pool;
  if (isUnknown && apy >= SCAM.unknownHighApy) {
    return {
      fired: true,
      confidence: "medium",
      reason: `Unknown token(s) (${tokens.join("/")}) offering ${apy}% APY — ` +
              `unverified tokens can be minted infinitely to fake yield or drained silently`,
    };
  }
  return { fired: false };
}

/**
 * Emission-only + extreme APY: reward token will hyperinflate.
 */
function detectEmissionPump(pool) {
  const { apy, rewardSource } = pool;
  if (rewardSource === "emissions" && apy > 200) {
    return {
      fired: true,
      confidence: "medium",
      reason: `Pure emission rewards at ${apy}% APY — reward token supply inflates rapidly, ` +
              `causing APY to collapse within days to weeks as sell pressure builds`,
    };
  }
  return { fired: false };
}

/**
 * TVL spike detection — requires historical data.
 * Sudden large TVL inflows are used to manufacture credibility before a rug.
 */
function detectTvlSpike(pool, historical) {
  if (!historical || historical.length < 2) return { fired: false };

  const oldest = historical[0].tvl;
  const latest = pool.tvl;

  if (oldest > 0 && latest / oldest >= SCAM.tvlSpikeRatio) {
    const multiplier = (latest / oldest).toFixed(1);
    return {
      fired: true,
      confidence: "medium",
      reason: `TVL spiked ${multiplier}× in recent history ($${(oldest/1000).toFixed(0)}k → ` +
              `$${(latest/1000).toFixed(0)}k) — sudden inflows without volume growth can signal ` +
              `coordinated liquidity staging before a rug`,
    };
  }
  return { fired: false };
}

/**
 * Mismatch: high TVL but zero volume.
 * Locked or fake liquidity used to look legitimate.
 */
function detectLockedLiquidity(pool) {
  const { tvl, volume7d } = pool;
  if (tvl >= 500_000 && volume7d === 0) {
    return {
      fired: true,
      confidence: "medium",
      reason: `High TVL ($${(tvl/1e6).toFixed(1)}M) with zero recorded volume — ` +
              `liquidity appears locked or staged; not generating real yield`,
    };
  }
  return { fired: false };
}

// ─── Aggregator ───────────────────────────────────────────────────────────────

/**
 * Run all signal detectors and aggregate results.
 *
 * @param {Object} pool
 * @param {Array}  [historical] — [{ timestamp, tvl }] sorted oldest first
 * @returns {{ isScam: boolean, confidence: string, scamReasons: string[] }}
 */
function detectScam(pool, historical = []) {
  const detectors = [
    detectHoneyPot(pool),
    detectGhostVolume(pool),
    detectRugSetup(pool),
    detectUnknownHighApy(pool),
    detectEmissionPump(pool),
    detectTvlSpike(pool, historical),
    detectLockedLiquidity(pool),
  ];

  const fired = detectors.filter((d) => d.fired);
  const highConfidence   = fired.filter((d) => d.confidence === "high");
  const mediumConfidence = fired.filter((d) => d.confidence === "medium");

  // isScam = any HIGH confidence OR 2+ MEDIUM confidence together
  const isScam =
    highConfidence.length >= 1 ||
    mediumConfidence.length >= 2;

  // Overall confidence
  let confidence = "none";
  if (highConfidence.length >= 1)   confidence = "high";
  else if (mediumConfidence.length >= 2) confidence = "medium";
  else if (mediumConfidence.length === 1) confidence = "low";

  return {
    isScam,
    confidence,
    scamReasons: fired.map((d) => d.reason),
  };
}

module.exports = { detectScam };