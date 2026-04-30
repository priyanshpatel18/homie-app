/**
 * userProfile — persists user preferences per wallet in AsyncStorage.
 *
 * Shape:
 *   riskTolerance  — "low" | "medium" | "high"
 *   goal           — "passive_income" | "growth" | "trading" | "exploring"
 *   experience     — "beginner" | "intermediate" | "advanced"
 *   monthlyBudget  — null | number (USD they plan to deploy monthly)
 *   createdAt      — ISO string
 *   updatedAt      — ISO string
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = (wallet) => `@homie_profile_${wallet}`;

export const RISK_LABELS = {
  low:    { label: "Safe",       desc: "Stable yields, low volatility. Sleep well." },
  medium: { label: "Balanced",   desc: "Mix of yield and growth. Calculated bets." },
  high:   { label: "Aggressive", desc: "Max returns. You know the risks." },
};

export const GOAL_LABELS = {
  passive_income: { label: "Passive income",  desc: "Earn yield while you hold" },
  growth:         { label: "Grow my bag",     desc: "Beat the market over time"  },
  trading:        { label: "Active trading",  desc: "Capture short-term moves"   },
  exploring:      { label: "Just exploring",  desc: "Learning how DeFi works"    },
};

export const EXPERIENCE_LABELS = {
  beginner:     "New to DeFi",
  intermediate: "Know the basics",
  advanced:     "Full degen",
};

export async function saveProfile(walletAddress, profile) {
  try {
    const existing = await loadProfile(walletAddress);
    const updated = {
      ...existing,
      ...profile,
      updatedAt: new Date().toISOString(),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    await AsyncStorage.setItem(KEY(walletAddress), JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.warn("[userProfile] save failed:", e.message);
    return null;
  }
}

export async function loadProfile(walletAddress) {
  try {
    const raw = await AsyncStorage.getItem(KEY(walletAddress));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function clearProfile(walletAddress) {
  try {
    await AsyncStorage.removeItem(KEY(walletAddress));
  } catch {}
}

/** Returns a short string injected into the agent system prompt */
export function profileToContext(profile) {
  if (!profile) return "";
  const risk  = RISK_LABELS[profile.riskTolerance]?.label  ?? profile.riskTolerance;
  const goal  = GOAL_LABELS[profile.goal]?.label           ?? profile.goal;
  const exp   = EXPERIENCE_LABELS[profile.experience]      ?? profile.experience;
  const budget = profile.monthlyBudget
    ? `Monthly DeFi budget: ~$${profile.monthlyBudget}.`
    : "";
  return `\nUser profile: Risk=${risk}, Goal=${goal}, Experience=${exp}. ${budget} Tailor all suggestions to this profile — don't show high-risk options to a Safe user, don't over-explain to an Advanced user.`;
}
