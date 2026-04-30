/**
 * useInputSuggestion — DeFi-aware input autocomplete.
 *
 * Returns the single best completion for the current input text.
 * Priority: user's own past queries first, then curated DeFi phrases.
 * Triggers after 3+ characters, matches on prefix (case-insensitive).
 */

import { useState, useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const PAST_KEY = (wallet) => `@homie_past_queries_${wallet}`;
const MAX_PAST = 80;

// ─── Curated DeFi phrase library ─────────────────────────────────────────────
const DEFI_PHRASES = [
  // Portfolio
  "What's my portfolio worth?",
  "Show my token balances",
  "What tokens am I holding?",
  "What's my total value in USD?",
  "Show me my wallet breakdown",

  // SOL price & market
  "What's SOL price today?",
  "How is SOL performing this week?",
  "What's the SOL/USDC rate?",
  "Is SOL bullish right now?",
  "What's the best time to buy SOL?",

  // Yield & staking
  "What's the best yield for SOL?",
  "Show me the highest APY right now",
  "Where can I earn yield on USDC?",
  "Compare Kamino and Marinade yields",
  "What's the current Marinade staking APY?",
  "How much would I earn staking 1 SOL?",
  "Show me stable yield options",
  "What's the safest yield strategy?",
  "Find me yields above 10% APY",

  // Staking
  "Stake my SOL on Marinade",
  "How do I start earning staking rewards?",
  "What's the difference between staking and lending?",
  "Unstake my SOL from Marinade",
  "How long does unstaking take?",

  // Lending
  "Lend my USDC on Kamino",
  "What's the lending APY on Kamino?",
  "What's my health factor on Kamino?",
  "Withdraw my funds from Kamino",
  "Is my lending position at risk?",

  // Swapping
  "Swap SOL to USDC",
  "Swap USDC to SOL",
  "What's the best swap route for SOL to BONK?",
  "Buy some BONK",
  "Swap 10 USDC to SOL",

  // Risk & safety
  "Simulate a market crash",
  "What happens to my portfolio if SOL drops 30%?",
  "What's my risk score?",
  "Is my portfolio too risky?",
  "How do I reduce my risk?",
  "What's my biggest risk right now?",
  "Should I take profits?",

  // Education
  "Explain impermanent loss",
  "What is APY?",
  "What is liquid staking?",
  "How does Kamino work?",
  "What's the difference between APY and APR?",
  "Why is yield farming risky?",
  "What is a liquidity pool?",
  "Explain slippage",
  "What is MEV?",
  "How do I protect against rug pulls?",

  // Strategy
  "Suggest a yield strategy for my portfolio",
  "What should I do with my idle SOL?",
  "Give me a conservative DeFi strategy",
  "Maximize my yield with low risk",
  "How should I diversify my Solana portfolio?",
  "What's a good strategy for a bear market?",
  "Should I hold or deploy my USDC?",

  // Positions
  "Show my open positions",
  "What are my active yields?",
  "Am I earning anything right now?",
  "How much have I earned this month?",
];

// ─── Storage helpers ──────────────────────────────────────────────────────────

export async function recordUserQuery(walletAddress, query) {
  if (!walletAddress || !query || query.length < 6) return;
  try {
    const raw  = await AsyncStorage.getItem(PAST_KEY(walletAddress));
    let past   = raw ? JSON.parse(raw) : [];
    past       = [query, ...past.filter(q => q !== query)];
    if (past.length > MAX_PAST) past = past.slice(0, MAX_PAST);
    await AsyncStorage.setItem(PAST_KEY(walletAddress), JSON.stringify(past));
  } catch {}
}

async function loadPastQueries(walletAddress) {
  if (!walletAddress) return [];
  try {
    const raw = await AsyncStorage.getItem(PAST_KEY(walletAddress));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// ─── Matching ─────────────────────────────────────────────────────────────────

function findBestMatch(input, candidates) {
  if (!input || input.length < 3) return null;
  const lower = input.toLowerCase();

  // 1. Exact prefix match
  const prefixMatch = candidates.find(
    c => c.toLowerCase().startsWith(lower) && c.toLowerCase() !== lower
  );
  if (prefixMatch) return prefixMatch;

  // 2. Word-boundary match (any word in the phrase starts with input)
  const words = lower.split(/\s+/);
  const lastWord = words[words.length - 1];
  if (lastWord.length >= 3) {
    for (const c of candidates) {
      const cLower = c.toLowerCase();
      if (cLower.includes(lower) && cLower !== lower) return c;
    }
  }

  return null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useInputSuggestion(input, walletAddress) {
  const [suggestion, setSuggestion] = useState(null);
  const pastRef = useRef([]);

  // Load past queries once on mount / wallet change
  useEffect(() => {
    loadPastQueries(walletAddress).then(past => { pastRef.current = past; });
  }, [walletAddress]);

  useEffect(() => {
    if (!input || input.length < 3) {
      setSuggestion(null);
      return;
    }

    // Past queries take priority — feel personalized
    const fromPast = findBestMatch(input, pastRef.current);
    if (fromPast) { setSuggestion(fromPast); return; }

    // Fall back to curated library
    const fromLib = findBestMatch(input, DEFI_PHRASES);
    setSuggestion(fromLib);
  }, [input]);

  return suggestion;
}
