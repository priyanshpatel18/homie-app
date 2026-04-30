import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "./api";

const KEY = (wallet) => `@homie_autopilot_${wallet}`;

// ─── Strategy templates ───────────────────────────────────────────────────────

export const AUTOPILOT_STRATEGIES = {
  yield: {
    id:           "yield",
    name:         "Yield Farmer",
    desc:         "Most of your SOL earning yield — staking + lending, minimal idle cash.",
    targets:      { liquid: 10, staked: 60, lending: 30 },
    estimatedApy: "~8–9%",
  },
  balanced: {
    id:           "balanced",
    name:         "Balanced",
    desc:         "Mix of yield and liquidity — stay ready for opportunities.",
    targets:      { liquid: 40, staked: 40, lending: 20 },
    estimatedApy: "~5–6%",
  },
  preservation: {
    id:           "preservation",
    name:         "Capital Safe",
    desc:         "Most funds liquid. Low risk — you sleep well, Homie watches.",
    targets:      { liquid: 70, staked: 20, lending: 10 },
    estimatedApy: "~2–3%",
  },
  aggressive: {
    id:           "aggressive",
    name:         "Max Yield",
    desc:         "All-in on highest APY protocols. High reward, you know the risks.",
    targets:      { liquid: 5, staked: 70, lending: 25 },
    estimatedApy: "~9–11%",
  },
};

export const DRIFT_THRESHOLDS = [
  { value: 5,  label: "Tight — 5%",    desc: "Alert me as soon as anything moves" },
  { value: 10, label: "Normal — 10%",  desc: "Alert when drift is meaningful" },
  { value: 20, label: "Relaxed — 20%", desc: "Only alert when seriously off-track" },
];

// ─── Persistence ──────────────────────────────────────────────────────────────

export async function saveAutopilot(walletAddress, config) {
  try {
    const full = { ...config, updatedAt: new Date().toISOString() };
    await AsyncStorage.setItem(KEY(walletAddress), JSON.stringify(full));
    // Sync to server (fire-and-forget) so push notifications work
    syncAutopilotToServer(walletAddress, full).catch(() => {});
    return full;
  } catch (e) {
    console.warn("[autopilot] save failed:", e.message);
    return null;
  }
}

export async function loadAutopilot(walletAddress) {
  try {
    const raw = await AsyncStorage.getItem(KEY(walletAddress));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function clearAutopilot(walletAddress) {
  try {
    await AsyncStorage.removeItem(KEY(walletAddress));
    syncAutopilotToServer(walletAddress, null).catch(() => {});
  } catch {}
}

async function syncAutopilotToServer(walletAddress, config) {
  await fetch(`${API_URL}/api/monitor/autopilot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress, config }),
  });
}

// ─── Allocation analysis ──────────────────────────────────────────────────────

/**
 * Compute current allocation from a portfolio object.
 * Returns { liquid, staked, lending } as integer percentages.
 */
export function computeAllocation(portfolio) {
  if (!portfolio) return { liquid: 100, staked: 0, lending: 0 };

  const solBalance = portfolio.solBalance ?? 0;
  const tokens     = portfolio.tokens ?? [];

  // mSOL ≈ staked SOL (Marinade)
  const mSolToken  = tokens.find((t) => t.symbol === "mSOL");
  const stakedSol  = mSolToken?.balance ?? 0;

  // kTokens = Kamino lending positions
  const lendingTokens = tokens.filter((t) => t.symbol?.startsWith("k") && t.symbol !== "kSOL");

  // USD values (use stored usdValue if present, else assume 0 for simplicity)
  const stakedUsd  = stakedSol * 1;          // will be multiplied by SOL price in caller
  const lendingUsd = lendingTokens.reduce((s, t) => s + (t.usdValue ?? 0), 0);
  const liquidUsd  = tokens
    .filter((t) => t.symbol !== "mSOL" && !t.symbol?.startsWith("k"))
    .reduce((s, t) => s + (t.usdValue ?? 0), 0) + solBalance;

  const total = stakedUsd + lendingUsd + liquidUsd;
  if (total <= 0) return { liquid: 100, staked: 0, lending: 0 };

  return {
    liquid:  Math.round((liquidUsd  / total) * 100),
    staked:  Math.round((stakedUsd  / total) * 100),
    lending: Math.round((lendingUsd / total) * 100),
  };
}

/**
 * Compare current allocation to strategy targets.
 * Returns { needsRebalance, maxDrift, drifts[] }
 */
export function checkDrift(current, targets, threshold = 10) {
  const drifts = Object.entries(targets).map(([bucket, target]) => ({
    bucket,
    current: current[bucket] ?? 0,
    target,
    drift:   Math.abs((current[bucket] ?? 0) - target),
  }));

  const maxDrift = Math.max(...drifts.map((d) => d.drift));
  return {
    needsRebalance: maxDrift >= threshold,
    maxDrift,
    drifts,
  };
}

/** Returns a string injected into the agent system prompt */
export function autopilotToContext(config) {
  if (!config?.enabled || !config?.strategyId) return "";
  const strategy = AUTOPILOT_STRATEGIES[config.strategyId];
  if (!strategy) return "";
  const { liquid, staked, lending } = strategy.targets;
  return `\nAutopilot: ACTIVE — ${strategy.name} strategy. Target allocation: ${liquid}% liquid, ${staked}% staked (Marinade), ${lending}% lending (Kamino). Drift alert threshold: ${config.driftThreshold ?? 10}%. When giving advice, prioritize moves that bring the portfolio toward these targets.`;
}
