// Full lesson definitions. Each lesson is an array of typed steps.

import type { Lesson, LessonCatalog, LessonId } from "./types";

export const LESSONS: LessonCatalog = {
  // ─── BASICS ────────────────────────────────────────────────────────────────

  "what-is-sol": {
    id: "what-is-sol",
    title: "What is SOL?",
    emoji: "◎",
    xp: 10,
    steps: [
      {
        type: "splash",
        emoji: "◎",
        title: "Meet SOL",
        subtitle:
          "SOL is the native currency of Solana, the same way ETH powers Ethereum or USD powers the US economy. Every action on Solana costs a tiny bit of SOL.",
      },
      {
        type: "comparison",
        title: "SOL vs Traditional Money",
        leftEmoji: "🏦",
        leftLabel: "Bank account",
        leftPoints: [
          "Controlled by a bank",
          "Transfers take days",
          "Closed on weekends",
          "Can be frozen",
        ],
        rightEmoji: "◎",
        rightLabel: "SOL wallet",
        rightPoints: [
          "You control it",
          "Settles in <1 second",
          "24/7, always on",
          "No one can freeze it",
        ],
      },
      {
        type: "your_numbers",
        title: "Your SOL balance",
        desc: "This is how much SOL you hold right now. Every transaction costs a fraction of a cent in SOL, so always keep a small amount for fees.",
        dataKey: "solBalance",
        unit: "SOL",
        tip: "Tip: keep at least 0.05 SOL for transaction fees.",
      },
      {
        type: "quiz",
        question: "What happens if you run out of SOL in your wallet?",
        options: [
          { text: "Your tokens disappear", correct: false },
          { text: "You can't pay transaction fees", correct: true },
          { text: "Your account gets deleted", correct: false },
          { text: "Nothing, SOL isn't needed", correct: false },
        ],
        explanation:
          "SOL covers \"gas\" fees. Without it you can't send tokens or interact with apps, and your assets stay safe.",
      },
      {
        type: "cta",
        emoji: "◎",
        title: "You know SOL now.",
        desc: "Next: learn how your SOL can work for you instead of sitting idle.",
        actionLabel: "Start: What is staking?",
        nextLessonId: "what-is-staking",
      },
    ],
  },

  // ─── SAVING & EARNING ────────────────────────────────────────────────────

  "what-is-staking": {
    id: "what-is-staking",
    title: "What is staking?",
    emoji: "🔒",
    xp: 20,
    steps: [
      {
        type: "splash",
        emoji: "🔒",
        title: "Staking equals earning interest",
        subtitle:
          "When you stake SOL you lend it to validators who run the Solana network. In return they share rewards with you, automatically, every 2 to 3 days.",
      },
      {
        type: "comparison",
        title: "Idle SOL vs Staked SOL",
        leftEmoji: "😴",
        leftLabel: "Idle SOL",
        leftPoints: [
          "Earns 0% APY",
          "Loses value to inflation",
          "Doing nothing for you",
          "Same amount next year",
        ],
        rightEmoji: "🔒",
        rightLabel: "Staked SOL",
        rightPoints: [
          "Earns ~7-8% APY",
          "Compounds automatically",
          "Still yours, unstake anytime",
          "Grows while you sleep",
        ],
      },
      {
        type: "apy_chart",
        title: "What ~7% APY means",
        desc: "Here's how $1,000 of SOL grows over time with staking rewards.",
        bars: [
          { label: "Now", multiplier: 1.0, color: "rgba(255,255,255,0.2)" },
          { label: "1 year", multiplier: 1.07, color: "#4ADE80" },
          { label: "3 years", multiplier: 1.225, color: "#34D399" },
          { label: "5 years", multiplier: 1.403, color: "#10B981" },
        ],
        baseLabel: "$1,000 staked",
      },
      {
        type: "your_numbers",
        title: "What your SOL could earn",
        desc: "If you staked your entire SOL balance today at 7.5% APY, here's your projected earning over 12 months.",
        dataKey: "stakingProjection",
        unit: "USD / year",
        tip: "You can unstake at any time. Staking isn't a lock-in.",
      },
      {
        type: "quiz",
        question: "Staking SOL means…",
        options: [
          { text: "Sending your SOL to an exchange", correct: false },
          { text: "Locking SOL forever", correct: false },
          { text: "Earning rewards by helping run the network", correct: true },
          { text: "Converting SOL to another token", correct: false },
        ],
        explanation:
          "Staking is delegating your SOL to a validator. Your SOL stays yours, you're just putting it to work.",
      },
      {
        type: "cta",
        emoji: "🔒",
        title: "Staking unlocked.",
        desc: "Now learn the even better version: liquid staking. Same rewards, but your SOL stays moveable.",
        actionLabel: "Next: Liquid staking",
        nextLessonId: "liquid-staking",
      },
    ],
  },

  "liquid-staking": {
    id: "liquid-staking",
    title: "Liquid staking explained",
    emoji: "💧",
    xp: 25,
    steps: [
      {
        type: "splash",
        emoji: "💧",
        title: "Stake and stay liquid",
        subtitle:
          "Normal staking locks your SOL for ~3 days when you want it back. Liquid staking gives you a receipt token (like mSOL or jitoSOL) that you can use immediately, while still earning staking rewards.",
      },
      {
        type: "comparison",
        title: "Regular Staking vs Liquid Staking",
        leftEmoji: "🔒",
        leftLabel: "Regular staking",
        leftPoints: [
          "~7% APY",
          "SOL locked during unstake (~3 days)",
          "Can't use SOL elsewhere",
          "Simple",
        ],
        rightEmoji: "💧",
        rightLabel: "Liquid staking",
        rightPoints: [
          "~7-8% APY (same or better)",
          "Trade or use your receipt instantly",
          "Use as collateral on Kamino",
          "Best of both worlds",
        ],
      },
      {
        type: "apy_chart",
        title: "Live LST rates",
        desc: "These are today's approximate APYs for the top liquid staking tokens on Solana.",
        bars: [
          { label: "mSOL", apy: 7.2, color: "#60A5FA" },
          { label: "jitoSOL", apy: 7.8, color: "#A78BFA" },
          { label: "INF", apy: 8.1, color: "#4ADE80" },
          { label: "bSOL", apy: 7.4, color: "#FBBF24" },
        ],
        baseLabel: "APY %",
        isLiveApy: true,
      },
      {
        type: "your_numbers",
        title: "Your liquid staking potential",
        desc: "Based on your current SOL balance, here's what you'd earn staking into INF at today's APY.",
        dataKey: "liquidStakingProjection",
        unit: "USD / year",
        tip: "mSOL can also be used as collateral on Kamino to borrow USDC, without selling.",
      },
      {
        type: "quiz",
        question: "What do you receive when you liquid-stake SOL?",
        options: [
          { text: "USDC", correct: false },
          { text: "A receipt token (like mSOL or jitoSOL)", correct: true },
          { text: "Nothing, it stays as SOL", correct: false },
          { text: "A paper certificate", correct: false },
        ],
        explanation:
          "The receipt token represents your staked SOL plus accumulated rewards. Its price goes up over time.",
      },
      {
        type: "cta",
        emoji: "💧",
        title: "Liquid staking: complete.",
        desc: "Your SOL can earn rewards AND stay ready to use. Next: how APY compounds over time.",
        actionLabel: "Next: How APY compounds",
        nextLessonId: "what-is-apy",
      },
    ],
  },

  "what-is-apy": {
    id: "what-is-apy",
    title: "How APY compounds",
    emoji: "📈",
    xp: 20,
    steps: [
      {
        type: "splash",
        emoji: "📈",
        title: "APY vs APR",
        subtitle:
          "APR is simple interest, you earn the same amount every period. APY is compounding interest, your rewards earn rewards too. On Solana, staking rewards compound every epoch (~2 days).",
      },
      {
        type: "apy_chart",
        title: "$1,000 at 8% APY vs 8% APR",
        desc: "Over time, compounding pulls ahead. The gap widens every year.",
        bars: [
          { label: "APR 1yr", multiplier: 1.08, color: "rgba(255,255,255,0.3)" },
          { label: "APY 1yr", multiplier: 1.083, color: "#4ADE80" },
          { label: "APR 5yr", multiplier: 1.4, color: "rgba(255,255,255,0.3)" },
          { label: "APY 5yr", multiplier: 1.469, color: "#10B981" },
        ],
        baseLabel: "$1,000",
      },
      {
        type: "quiz",
        question: "Why does APY beat APR over time?",
        options: [
          { text: "APY has a higher rate", correct: false },
          { text: "Rewards are reinvested automatically", correct: true },
          { text: "APR is taxed, APY isn't", correct: false },
          { text: "They're the same thing", correct: false },
        ],
        explanation:
          "With APY, each reward payment gets added to your principal, so the next payment is slightly larger. Over years, this compounds into significantly more.",
      },
      {
        type: "cta",
        emoji: "📈",
        title: "You understand compounding.",
        desc: "Next: the three liquid staking tokens on Solana and how to pick the right one.",
        actionLabel: "Next: mSOL, jitoSOL, INF",
        nextLessonId: "lst-explained",
      },
    ],
  },

  "lst-explained": {
    id: "lst-explained",
    title: "mSOL, jitoSOL, INF: what's the difference?",
    emoji: "🌊",
    xp: 25,
    steps: [
      {
        type: "splash",
        emoji: "🌊",
        title: "Three LSTs, one choice",
        subtitle:
          "mSOL, jitoSOL, and INF all earn staking rewards, but they route those rewards differently. Here's how to pick the right one for you.",
      },
      {
        type: "comparison",
        title: "mSOL vs jitoSOL",
        leftEmoji: "🔵",
        leftLabel: "mSOL (Marinade)",
        leftPoints: [
          "~7.2% APY",
          "Spread across 100+ validators",
          "Most battle-tested LST",
          "Deep liquidity everywhere",
        ],
        rightEmoji: "🟣",
        rightLabel: "jitoSOL (Jito)",
        rightPoints: [
          "~7.8% APY",
          "MEV rewards included",
          "Higher yield, slightly newer",
          "Widely accepted as collateral",
        ],
      },
      {
        type: "apy_chart",
        title: "Live APY comparison",
        desc: "Current rates, updated daily.",
        bars: [
          { label: "mSOL", apy: 7.2, color: "#60A5FA" },
          { label: "jitoSOL", apy: 7.8, color: "#A78BFA" },
          { label: "INF", apy: 8.1, color: "#4ADE80" },
          { label: "bSOL", apy: 7.4, color: "#FBBF24" },
        ],
        baseLabel: "APY %",
        isLiveApy: true,
      },
      {
        type: "quiz",
        question: "INF (Sanctum) earns a higher APY because…",
        options: [
          { text: "It's riskier", correct: false },
          { text: "It aggregates rewards from many LSTs", correct: true },
          { text: "It's backed by USDC", correct: false },
          { text: "It compounds less often", correct: false },
        ],
        explanation:
          "INF (Infinity) pools across many liquid staking tokens, capturing diversified validator rewards, which typically pushes the blended APY higher.",
      },
      {
        type: "cta",
        emoji: "🌊",
        title: "LST comparison: complete.",
        desc: "You now know the main liquid staking tokens on Solana. Your wallet data shows which ones you already hold.",
        actionLabel: "View my wallet",
        nextLessonId: null,
        actionType: "wallet",
      },
    ],
  },

  "idle-sol": {
    id: "idle-sol",
    title: "What idle SOL costs you",
    emoji: "😴",
    xp: 15,
    steps: [
      {
        type: "splash",
        emoji: "😴",
        title: "Doing nothing has a cost",
        subtitle:
          "Solana's inflation rate is around 5-7% per year. If your SOL sits idle, it's not earning rewards, but the supply is inflating around you, which dilutes your share of the network.",
      },
      {
        type: "your_numbers",
        title: "What your idle SOL is losing",
        desc: "At current staking rates (~7.5% APY), here's how much your unstaked SOL balance is missing out on each year.",
        dataKey: "idleSolOpportunityCost",
        unit: "USD / year",
        tip: "Staking takes under 30 seconds. Rewards start in the next epoch (~2 days).",
      },
      {
        type: "quiz",
        question: "Why does inflation matter for idle SOL holders?",
        options: [
          { text: "Their SOL balance decreases", correct: false },
          { text: "Their share of the total supply shrinks", correct: true },
          { text: "They get charged a fee", correct: false },
          { text: "Inflation doesn't affect SOL", correct: false },
        ],
        explanation:
          "Staking rewards offset inflation, you earn new SOL proportional to the inflation rate. Non-stakers get diluted.",
      },
      {
        type: "cta",
        emoji: "😴",
        title: "Now you see the cost.",
        desc: "Your SOL doesn't have to sit idle. Start earning with one tap.",
        actionLabel: "Explore: Liquid staking",
        nextLessonId: "liquid-staking",
      },
    ],
  },
};

// Ordered list for the catalog display.
export const LESSON_IDS_ORDERED: LessonId[] = [
  "what-is-sol",
  "what-is-wallet",
  "what-is-transaction",
  "what-is-token",
  "what-is-staking",
  "liquid-staking",
  "what-is-apy",
  "lst-explained",
  "idle-sol",
  "what-is-kamino",
  "health-factor",
  "borrow-safely",
  "what-is-dex",
  "what-is-slippage",
  "dca-strategy",
  "what-is-leverage",
  "impermanent-loss",
  "what-is-playbook",
];

export function getLesson(id: LessonId): Lesson | undefined {
  return LESSONS[id];
}
