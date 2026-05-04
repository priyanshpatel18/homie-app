import { request } from "./client";
import type {
  HomeSnapshot,
  IdleSuggestionResponse,
  OnboardingGoal,
  OnboardingRisk,
  OnboardingVerbosity,
  StreakState,
  UserPersona,
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

// ─── Onboarding persona ───────────────────────────────────────────────────────

export async function savePreferences(input: {
  walletAddress: string;
  goal: OnboardingGoal;
  verbosity: OnboardingVerbosity;
  risk?: OnboardingRisk;
}): Promise<UserPersona> {
  return request<UserPersona>(`/api/home/preferences`, {
    method: "POST",
    body: input,
  });
}

export async function fetchPreferences(
  walletAddress: string,
): Promise<UserPersona | null> {
  return request<UserPersona | null>(
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
