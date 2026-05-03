import { request } from "./client";
import type { HomeSnapshot, StreakState } from "./types";

// ─── Home snapshot ────────────────────────────────────────────────────────────

/**
 * Fetch the unified Home snapshot for a wallet. Includes archetype, idle
 * balance, open positions, top suggestion, lesson progress, and streak.
 */
export async function fetchHomeSnapshot(
  walletAddress: string,
): Promise<HomeSnapshot> {
  return request<HomeSnapshot>(`/api/home/snapshot/${walletAddress}`);
}

// ─── Streak ───────────────────────────────────────────────────────────────────

/**
 * Fetch the current and longest streak for a wallet.
 */
export async function fetchStreak(walletAddress: string): Promise<StreakState> {
  return request<StreakState>(`/api/home/streak/${walletAddress}`);
}
