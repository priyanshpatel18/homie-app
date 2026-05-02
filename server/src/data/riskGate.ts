/**
 * Risk gating — three-tier evaluation for transaction tools.
 * Injected into tool results so the agent can surface warnings
 * in a mode-aware way (Learn: always, Ask: warn+severe, Auto: severe only).
 */

export type RiskTier = "safe" | "warn" | "severe";

export interface RiskEvaluation {
  tier: RiskTier;
  reasons: string[];
}

// Protocols considered established and battle-tested
const SAFE_PROTOCOLS = new Set([
  "marinade",
  "marinade finance",
  "kamino",
  "kamino lend",
  "kamino finance",
  "jupiter",
  "jupiter aggregator",
  "jito",
  "jito network",
  "sanctum",
  "marginfi",
  "mrgn",
  "solend",
]);

// Actions that carry inherent IL or complexity risk regardless of amount
const WARN_ACTIONS = new Set([
  "lp",
  "liquidity",
  "provide_liquidity",
  "open_lp",
  "orca_lp",
  "dca",
  "create_dca",
  "limit_order",
  "create_limit_order",
]);

// Actions that carry liquidation risk or high-trust automation
const SEVERE_ACTIONS = new Set([
  "leverage",
  "multiply",
  "open_leverage",
  "open_kamino_leverage",
  "kamino_leverage",
  "kamino_multiply",
  "borrow",
  "short",
]);

const SAFE_AMOUNT_THRESHOLD  = 500;   // USD — below this, established protocols are safe
const WARN_AMOUNT_THRESHOLD  = 5000;  // USD — above this, any protocol gets a size warning
const SEVERE_AMOUNT_THRESHOLD = 10000; // USD — above this, adds severe size flag

function normalise(s: string | undefined | null): string {
  return (s ?? "").toLowerCase().trim();
}

export function evaluateRisk(
  protocol: string,
  action: string,
  amountUsd: number,
): RiskEvaluation {
  const proto  = normalise(protocol);
  const act    = normalise(action);
  const amount = amountUsd || 0;

  const reasons: string[] = [];
  let tier: RiskTier = "safe";

  // --- Protocol trust level ---
  const isKnownProtocol = SAFE_PROTOCOLS.has(proto) ||
    [...SAFE_PROTOCOLS].some((p) => proto.includes(p));

  if (!isKnownProtocol && proto.length > 0) {
    reasons.push(`Unverified protocol: "${protocol}" — double-check before transacting`);
    tier = "warn";
  }

  // --- Action-specific risks ---
  const isWarnAction   = WARN_ACTIONS.has(act)   || [...WARN_ACTIONS].some((a)   => act.includes(a));
  const isSevereAction = SEVERE_ACTIONS.has(act)  || [...SEVERE_ACTIONS].some((a) => act.includes(a));

  if (isSevereAction) {
    reasons.push("Leverage/multiply positions can be liquidated if collateral value drops");
    tier = "severe";
  } else if (isWarnAction) {
    if (act.includes("lp") || act.includes("liquidity")) {
      reasons.push("LP positions carry impermanent loss risk — value can drop even if both tokens rise");
    }
    if (act.includes("dca")) {
      reasons.push("DCA orders execute automatically over time — make sure the schedule fits your plan");
    }
    if (act.includes("limit") || act.includes("trigger")) {
      reasons.push("Limit/trigger orders execute automatically — confirm your trigger price is correct");
    }
    if (tier === "safe") tier = "warn";
  }

  // --- Size-based escalation ---
  if (amount >= SEVERE_AMOUNT_THRESHOLD) {
    reasons.push(`Large position: $${amount.toLocaleString()} — consider splitting to reduce single-tx risk`);
    if (tier !== "severe") tier = "warn";
  } else if (amount >= WARN_AMOUNT_THRESHOLD) {
    reasons.push(`Significant size: $${amount.toLocaleString()} — review carefully before confirming`);
    if (tier === "safe") tier = "warn";
  } else if (amount >= SAFE_AMOUNT_THRESHOLD && !isKnownProtocol) {
    // Unverified protocol + non-trivial amount → bump to warn
    if (tier === "safe") tier = "warn";
  }

  // --- Promote warn→severe if unverified protocol + large amount ---
  if (!isKnownProtocol && amount >= WARN_AMOUNT_THRESHOLD) {
    tier = "severe";
    if (!reasons.some((r) => r.includes("Unverified"))) {
      reasons.push(`Unverified protocol with large amount — high risk`);
    }
  }

  // If no reasons collected but tier is safe, add a positive confirmation
  if (reasons.length === 0) {
    reasons.push("Established protocol, standard transaction — risk is low");
  }

  return { tier, reasons };
}
