import { request } from "./client";
import type {
  HomeSnapshot,
  IdleSuggestionResponse,
  OnboardingGoal,
  OnboardingVerbosity,
  StreakState,
  UserPreferences,
} from "./types";

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

// ─── Onboarding preferences ───────────────────────────────────────────────────

export async function savePreferences(input: {
  walletAddress: string;
  goal: OnboardingGoal;
  verbosity: OnboardingVerbosity;
}): Promise<UserPreferences> {
  return request<UserPreferences>(`/api/home/preferences`, {
    method: "POST",
    body: input,
  });
}

export async function fetchPreferences(
  walletAddress: string,
): Promise<UserPreferences | null> {
  return request<UserPreferences | null>(
    `/api/home/preferences/${walletAddress}`,
  );
}

// ─── Idle balance suggestion ──────────────────────────────────────────────────

export async function fetchIdleSuggestion(
  walletAddress: string,
): Promise<IdleSuggestionResponse> {
  return request<IdleSuggestionResponse>(
    `/api/home/idle-suggestion/${walletAddress}`,
  );
}
