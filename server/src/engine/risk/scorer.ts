// @ts-nocheck
/**
 * scorer.js — core risk evaluation engine.
 *
 * Public API:
 *   evaluatePool(pool)     → number (0–100)
 *   classifyRisk(score)    → "low" | "medium" | "high"
 *   getRiskAnalysis(pool)  → { score, label, reasons, warnings }
 *
 * Pool shape:
 * {
 *   pair:         string,      e.g. "SOL-USDC"
 *   tvl:          number,      USD
 *   apy:          number,      percent
 *   volume7d:     number,      USD
 *   tokens:       string[],    ["SOL","USDC"]
 *   isStablePair: boolean,
 *   isBluechip:   boolean,
 *   isMeme:       boolean,
 *   isUnknown:    boolean,     token not on major aggregators
 *   audited:      boolean,
 *   rewardSource: "fees"|"emissions"|"mixed"
 * }
 */

const W = require("./weights");

// ─── Individual component scorers ─────────────────────────────────────────────

function scoreTvl(tvl) {
  for (const tier of W.TVL_TIERS) {
    if (tvl >= tier.min) return tier.score;
  }
  return 0;
}

function scoreApy(apy, rewardSource) {
  let base = 0;
  for (const tier of W.APY_TIERS) {
    if (apy <= tier.max) { base = tier.score; break; }
  }
  const multiplier = W.REWARD_SOURCE_MULTIPLIER[rewardSource] ?? 1;
  return Math.round(base * multiplier);
}

function scoreTokens(isStablePair, isBluechip, isMeme, isUnknown) {
  if (isUnknown)    return W.TOKEN_SCORES.unknown;
  if (isMeme)       return W.TOKEN_SCORES.meme;
  if (isStablePair) return W.TOKEN_SCORES.stable;
  if (isBluechip)   return W.TOKEN_SCORES.bluechipOnly;
  return W.TOKEN_SCORES.altcoin;
}

function scoreVolume(volume7d, tvl) {
  if (tvl <= 0) return 0;
  const ratio = volume7d / tvl;
  // Find matching tier (ranges can overlap — order matters)
  for (const tier of W.VOLUME_RATIO_TIERS) {
    if (ratio >= tier.min && ratio < tier.max) return tier.score;
  }
  return 2;
}

function scoreProtocol(audited) {
  return audited ? W.PROTOCOL_SCORE.audited : W.PROTOCOL_SCORE.notAudited;
}

function scoreRewardSource(rewardSource) {
  return W.REWARD_SOURCE_SCORE[rewardSource] ?? 0;
}

function ilPenalty(isStablePair, isBluechip, isMeme, isUnknown) {
  if (isStablePair) return W.IL_PENALTY.stable;
  if (isUnknown)    return W.IL_PENALTY.unknown;
  if (isMeme)       return W.IL_PENALTY.meme;
  if (isBluechip)   return W.IL_PENALTY.bluechip;
  return W.IL_PENALTY.altcoin;
}

// ─── Reason generators ────────────────────────────────────────────────────────

function tvlReasons(tvl, score) {
  const reasons = [], warnings = [];
  const fmt = (n) => n >= 1e6 ? `$${(n/1e6).toFixed(1)}M` : `$${(n/1e3).toFixed(0)}k`;

  if (score >= 22) {
    reasons.push(`Excellent liquidity depth (${fmt(tvl)} TVL) — deep pools resist price manipulation`);
  } else if (score >= 18) {
    reasons.push(`Strong TVL (${fmt(tvl)}) — sufficient depth for retail and mid-size positions`);
  } else if (score >= 13) {
    reasons.push(`Adequate TVL (${fmt(tvl)}) — suitable for small positions`);
    warnings.push(`TVL is moderate — large trades may cause meaningful slippage`);
  } else if (score >= 7) {
    warnings.push(`Low TVL (${fmt(tvl)}) — exit liquidity is limited, vulnerable to whale moves`);
  } else if (score >= 3) {
    warnings.push(`Very low TVL (${fmt(tvl)}) — extreme slippage risk for any position above $1k`);
  } else {
    warnings.push(`Dangerously low TVL (${fmt(tvl)}) — this pool lacks meaningful liquidity`);
  }
  return { reasons, warnings };
}

function apyReasons(apy, rewardSource, rawApyScore) {
  const reasons = [], warnings = [];

  if (apy <= 10) {
    reasons.push(`Sustainable yield range (${apy}% APY) — consistent with real fee generation`);
  } else if (apy <= 25) {
    reasons.push(`Healthy APY (${apy}%) — elevated but plausible for an active pool`);
  } else if (apy <= 50) {
    warnings.push(`Elevated APY (${apy}%) — verify this is backed by genuine trading volume`);
  } else if (apy <= 100) {
    warnings.push(`High APY (${apy}%) — likely driven by token emissions; yield will decrease as rewards dilute`);
  } else if (apy <= 200) {
    warnings.push(`Unsustainable APY (${apy}%) — emission-driven yields at this level rarely last more than weeks`);
  } else {
    warnings.push(`Extreme APY (${apy}%) — almost certainly unsustainable; classic sign of incentive-farming or scam`);
  }

  if (rewardSource === "emissions") {
    warnings.push(`Rewards come entirely from token emissions — APY will decay as the token inflates`);
  } else if (rewardSource === "mixed") {
    reasons.push(`Yield is a mix of trading fees and emissions — partially sustainable`);
  } else if (rewardSource === "fees") {
    reasons.push(`Yield is 100% from trading fees — real, sustainable, market-driven`);
  }

  return { reasons, warnings };
}

function tokenReasons(isStablePair, isBluechip, isMeme, isUnknown, tokens) {
  const reasons = [], warnings = [];
  const tokenList = tokens.join("/");

  if (isUnknown) {
    warnings.push(`Token(s) in ${tokenList} are not listed on major aggregators — provenance unverified`);
    warnings.push(`Unknown tokens carry significant rug pull and liquidity disappearance risk`);
  } else if (isMeme) {
    warnings.push(`Meme token exposure (${tokenList}) — value is narrative-driven and can collapse 90%+ rapidly`);
    warnings.push(`High impermanent loss risk if meme token spikes then crashes`);
  } else if (isStablePair) {
    reasons.push(`Stablecoin pair (${tokenList}) — no price volatility risk, minimal impermanent loss`);
  } else if (isBluechip) {
    reasons.push(`Bluechip token pair (${tokenList}) — established assets with deep market liquidity`);
  } else {
    reasons.push(`Mid-cap token pair (${tokenList}) — moderate volatility, verify project fundamentals`);
  }

  return { reasons, warnings };
}

function volumeReasons(volume7d, tvl) {
  const reasons = [], warnings = [];
  const ratio   = tvl > 0 ? volume7d / tvl : 0;
  const fmtV    = (n) => n >= 1e6 ? `$${(n/1e6).toFixed(1)}M` : `$${(n/1e3).toFixed(0)}k`;

  if (ratio >= 0.20 && ratio <= 1.0) {
    reasons.push(`Active trading volume (${fmtV(volume7d)} 7d) — healthy pool utilisation`);
  } else if (ratio >= 0.05) {
    reasons.push(`Moderate volume (${fmtV(volume7d)} 7d) — pool is being used`);
  } else if (ratio > 3.0) {
    warnings.push(`Volume/TVL ratio is unusually high (${ratio.toFixed(1)}×) — possible wash trading`);
  } else if (ratio < 0.01) {
    warnings.push(`Near-zero 7d volume (${fmtV(volume7d)}) — pool appears inactive; fees may be negligible`);
  }

  return { reasons, warnings };
}

function protocolReasons(audited) {
  const reasons = [], warnings = [];
  if (audited) {
    reasons.push(`Protocol has undergone a third-party security audit — smart contract risk is reduced`);
  } else {
    warnings.push(`No audit information available — smart contract bugs could lead to loss of funds`);
  }
  return { reasons, warnings };
}

function rewardSourceReasons(rewardSource) {
  // Already covered in apyReasons — avoid duplicate text
  return { reasons: [], warnings: [] };
}

function ilReasons(isStablePair, isBluechip, isMeme, isUnknown, penalty) {
  const reasons = [], warnings = [];

  if (penalty === 0) {
    reasons.push(`Negligible impermanent loss risk — both tokens are pegged to the same value`);
  } else if (penalty <= 5) {
    reasons.push(`Low-moderate impermanent loss risk — bluechip tokens tend to move together`);
  } else if (penalty <= 10) {
    warnings.push(`Standard impermanent loss exposure — if token prices diverge significantly, LP value suffers`);
  } else {
    warnings.push(`High impermanent loss risk — volatile or meme tokens can create severe IL on price swings`);
  }

  return { reasons, warnings };
}

// ─── Core evaluator ───────────────────────────────────────────────────────────

/**
 * Compute a 0–100 risk score for a pool.
 * Higher = safer.
 */
function evaluatePool(pool) {
  const {
    tvl, apy, volume7d,
    isStablePair = false,
    isBluechip   = false,
    isMeme       = false,
    isUnknown    = false,
    audited      = false,
    rewardSource = "emissions",
  } = pool;

  const components = {
    tvl:          scoreTvl(tvl),
    apy:          scoreApy(apy, rewardSource),
    tokens:       scoreTokens(isStablePair, isBluechip, isMeme, isUnknown),
    volume:       scoreVolume(volume7d, tvl),
    protocol:     scoreProtocol(audited),
    rewardSource: scoreRewardSource(rewardSource),
  };

  const rawScore = Object.values(components).reduce((a, b) => a + b, 0);
  const penalty  = ilPenalty(isStablePair, isBluechip, isMeme, isUnknown);
  const score    = Math.max(0, Math.min(100, rawScore - penalty));

  return { score: Math.round(score), components, ilPenalty: penalty };
}

/**
 * Classify a numeric score into a risk tier.
 */
function classifyRisk(score) {
  if (score >= W.RISK_BANDS.low.min)    return "low";
  if (score >= W.RISK_BANDS.medium.min) return "medium";
  return "high";
}

/**
 * Full analysis: score + label + human-readable reasoning.
 */
function getRiskAnalysis(pool) {
  const { score, components, ilPenalty: penalty } = evaluatePool(pool);
  const risk  = classifyRisk(score);
  const label = W.RISK_BANDS[risk].label;

  const allReasons  = [];
  const allWarnings = [];

  function merge(fn, ...args) {
    const { reasons, warnings } = fn(...args);
    allReasons.push(...reasons);
    allWarnings.push(...warnings);
  }

  merge(tvlReasons,       pool.tvl,         components.tvl);
  merge(apyReasons,       pool.apy,         pool.rewardSource, components.apy);
  merge(tokenReasons,     pool.isStablePair, pool.isBluechip, pool.isMeme, pool.isUnknown, pool.tokens);
  merge(volumeReasons,    pool.volume7d,    pool.tvl);
  merge(protocolReasons,  pool.audited);
  merge(ilReasons,        pool.isStablePair, pool.isBluechip, pool.isMeme, pool.isUnknown, penalty);

  return {
    score,
    risk,
    label,
    reasons:  allReasons,
    warnings: allWarnings,
    breakdown: {
      tvl:          components.tvl,
      apy:          components.apy,
      tokens:       components.tokens,
      volume:       components.volume,
      protocol:     components.protocol,
      rewardSource: components.rewardSource,
      ilPenalty:    -penalty,
    },
  };
}

module.exports = { evaluatePool, classifyRisk, getRiskAnalysis };