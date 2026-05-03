/**
 * Storage-agnostic virtual portfolio for paper trading. The storage adapter
 * is injected at app boot via configureSandboxStorage().
 */

import { getStorage } from "./storage";
import type { SandboxState } from "./types";

const KEY = (addr: string): string => `sandbox_v1_${addr}`;

export function createFreshState(): SandboxState {
  return {
    balances: { USDC: 200, SOL: 1 },
    initialValueUsd: null,
    history: [],
    performanceSnapshots: [],
    yieldTimestamps: {},
    createdAt: Date.now(),
  };
}

export async function loadSandboxState(walletAddress: string): Promise<SandboxState | null> {
  try {
    const raw = await getStorage().getItem(KEY(walletAddress));
    return raw ? (JSON.parse(raw) as SandboxState) : null;
  } catch {
    return null;
  }
}

export async function saveSandboxState(
  walletAddress: string,
  state: SandboxState,
): Promise<void> {
  try {
    await getStorage().setItem(KEY(walletAddress), JSON.stringify(state));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[sandbox] save failed:", msg);
  }
}

export async function resetSandboxState(walletAddress: string): Promise<SandboxState> {
  const fresh = createFreshState();
  await saveSandboxState(walletAddress, fresh);
  return fresh;
}
