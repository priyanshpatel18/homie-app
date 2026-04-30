/**
 * sandboxState — AsyncStorage-backed virtual portfolio for paper trading.
 *
 * State shape:
 *   balances:            { SOL: 2, USDC: 0, mSOL: 0, ... }
 *   initialValueUsd:     number | null  — set on first price snapshot
 *   history:             SandboxHistoryEntry[]
 *   performanceSnapshots: { timestamp, valueUsd }[]  — for line chart
 *   yieldTimestamps:     { mSOL: lastUpdatedMs, ... }
 *   createdAt:           ms
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = (addr) => `sandbox_v1_${addr}`;

export function createFreshState() {
  return {
    balances: { USDC: 200, SOL: 1 },
    initialValueUsd: null,  // set on first price snapshot (200 USDC + SOL at market price)
    history: [],
    performanceSnapshots: [],
    yieldTimestamps: {},
    createdAt: Date.now(),
  };
}

export async function loadSandboxState(walletAddress) {
  try {
    const raw = await AsyncStorage.getItem(KEY(walletAddress));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveSandboxState(walletAddress, state) {
  try {
    await AsyncStorage.setItem(KEY(walletAddress), JSON.stringify(state));
  } catch (err) {
    console.warn("[sandbox] save failed:", err.message);
  }
}

export async function resetSandboxState(walletAddress) {
  const fresh = createFreshState();
  await saveSandboxState(walletAddress, fresh);
  return fresh;
}
