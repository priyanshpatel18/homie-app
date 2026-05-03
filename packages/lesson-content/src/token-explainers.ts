// Plain-English token knowledge for the Wallet tab education cards.
// Keyed by on-chain mint address. SOL uses the key "SOL" (no mint).

import type { TokenExplainer, TokenExplainerMap } from "./types";

export const MSOL_MINT = "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So";
export const JITOSOL_MINT = "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn";
export const INF_MINT = "5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm";
export const BSOL_MINT = "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";

export const TOKEN_EXPLAINERS: TokenExplainerMap = {
  SOL: {
    emoji: "◎",
    name: "Solana",
    tagline: "The native currency of Solana",
    what: "SOL is the fuel that powers every action on Solana. Every transaction, sending tokens, swapping, staking, costs a tiny amount of SOL as a fee.",
    how: "Unlike a bank balance, no one can freeze or take your SOL. It lives in your wallet and only you control it.",
    action:
      "Your SOL can earn ~7-8% APY passively by staking it. You don't have to sell it, just put it to work.",
    color: "#9945FF",
    isStaking: false,
    relatedLessonId: "what-is-sol",
    relatedLessonLabel: "Learn: What is SOL?",
    rateKey: null,
  },

  [MSOL_MINT]: {
    emoji: "🔵",
    name: "Marinade Staked SOL",
    tagline: "Your SOL, earning rewards",
    what: "mSOL is a receipt token you get when you stake SOL with Marinade Finance. For every SOL you stake, you receive roughly 1 mSOL.",
    how: "The mSOL exchange rate rises over time because staking rewards are baked into it. Holding mSOL is the same as holding SOL plus earning ~7% APY.",
    action:
      "You can trade mSOL on any DEX, use it as collateral on Kamino, or unstake it back to SOL anytime, no lockup.",
    color: "#60A5FA",
    isStaking: true,
    relatedLessonId: "liquid-staking",
    relatedLessonLabel: "Learn: Liquid staking explained",
    rateKey: "marinade_apy",
  },

  [JITOSOL_MINT]: {
    emoji: "🟣",
    name: "Jito Staked SOL",
    tagline: "SOL staking plus MEV rewards",
    what: "jitoSOL is Jito's liquid staking token. Like mSOL, you stake SOL and get a receipt, and Jito adds MEV (maximal extractable value) rewards on top.",
    how: "MEV rewards come from Jito's block-building service that captures reordering profits. These are shared back to jitoSOL holders, giving a slightly higher APY than plain staking.",
    action:
      "jitoSOL is widely accepted as collateral on Kamino and other lending protocols. You can use it the same way as mSOL.",
    color: "#A78BFA",
    isStaking: true,
    relatedLessonId: "lst-explained",
    relatedLessonLabel: "Learn: mSOL vs jitoSOL vs INF",
    rateKey: "jitosol_apy",
  },

  [INF_MINT]: {
    emoji: "🟢",
    name: "Sanctum Infinity (INF)",
    tagline: "The highest-yield liquid staking token",
    what: "INF is Sanctum's pooled liquid staking token. Instead of staking with one validator set, INF aggregates across many LSTs (mSOL, jitoSOL, bSOL and more) to capture blended rewards.",
    how: "By pooling across many LSTs, Sanctum can typically offer a slightly higher blended APY. The INF exchange rate rises as rewards compound.",
    action:
      "INF can be used as collateral and traded freely. Sanctum allows near-instant liquidity between any LST, no waiting for unstaking.",
    color: "#4ADE80",
    isStaking: true,
    relatedLessonId: "lst-explained",
    relatedLessonLabel: "Learn: mSOL vs jitoSOL vs INF",
    rateKey: "sanctum_inf_apy",
  },

  [BSOL_MINT]: {
    emoji: "🔥",
    name: "BlazeStake SOL",
    tagline: "Community-governed liquid staking",
    what: "bSOL is BlazeStake's liquid staking token. You stake SOL with BlazeStake and receive bSOL in return, which earns staking rewards automatically.",
    how: "BlazeStake lets token holders vote on which validators receive delegations, making it a community-governed alternative to Marinade or Jito.",
    action:
      "bSOL can be swapped freely on Jupiter and used in select DeFi protocols on Solana.",
    color: "#FB923C",
    isStaking: true,
    relatedLessonId: "liquid-staking",
    relatedLessonLabel: "Learn: Liquid staking explained",
    rateKey: null,
  },

  [USDC_MINT]: {
    emoji: "💵",
    name: "USD Coin",
    tagline: "A dollar, on Solana",
    what: "USDC is a stablecoin, 1 USDC is always worth $1. It's issued by Circle and is fully backed by US dollars and short-term treasuries.",
    how: "Unlike SOL, USDC doesn't go up or down in price. It's used for buying tokens, lending, and as a safe haven when you want to preserve value.",
    action:
      "You can lend USDC on Kamino to earn ~5-8% APY, or use it to DCA into SOL automatically with Jupiter.",
    color: "#2775CA",
    isStaking: false,
    relatedLessonId: "what-is-dex",
    relatedLessonLabel: "Learn: What is a DEX?",
    rateKey: null,
  },

  [USDT_MINT]: {
    emoji: "💵",
    name: "Tether USD",
    tagline: "Another dollar-pegged stablecoin",
    what: "USDT (Tether) is the world's largest stablecoin by volume. Like USDC, 1 USDT is around $1. It's commonly used for trading and transfers.",
    how: "USDT is accepted on virtually every DeFi protocol. Unlike USDC, Tether's reserves are less transparently audited, most DeFi power users prefer USDC for long-term holdings.",
    action:
      "You can swap USDT to USDC for more transparency, or lend it on Kamino to earn yield.",
    color: "#26A17B",
    isStaking: false,
    relatedLessonId: null,
    relatedLessonLabel: null,
    rateKey: null,
  },
};

export const UNKNOWN_EXPLAINER: TokenExplainer = {
  emoji: "🪙",
  name: null,
  tagline: "Token on Solana",
  what: "This token lives in your Solana wallet. Every token on Solana has a unique mint address that defines it.",
  how: "Many tokens are governance tokens, meme coins, or receipt tokens from DeFi protocols. Always verify what a token is before trading it.",
  action:
    'Tap "Ask Homie" to get a plain-English explanation of exactly this token.',
  color: "rgba(255,255,255,0.4)",
  isStaking: false,
  relatedLessonId: "what-is-token",
  relatedLessonLabel: "Learn: What is a token?",
  rateKey: null,
};

export function getExplainer(mint: string | null | undefined): TokenExplainer {
  if (!mint) return TOKEN_EXPLAINERS.SOL!;
  return TOKEN_EXPLAINERS[mint] ?? UNKNOWN_EXPLAINER;
}
