import "dotenv/config";

const num = (v: string | undefined, fallback: number): number => {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};

export const env = {
  PORT: num(process.env.PORT, 4000),
  HOST: process.env.HOST ?? "0.0.0.0",
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com",
  JUP_API_KEY: process.env.JUP_API_KEY ?? "",
  BIRDEYE_API_KEY: process.env.BIRDEYE_API_KEY ?? "",
  SANCTUM_API_KEY: process.env.SANCTUM_API_KEY ?? "",
  LLM_BASE_URL: process.env.LLM_BASE_URL ?? "https://api.groq.com/openai/v1",
  LLM_API_KEY: process.env.LLM_API_KEY ?? process.env.OPENROUTER_API_KEY ?? "",
  LLM_MODEL: process.env.LLM_MODEL ?? "llama-3.3-70b-versatile",
  PRIVY_APP_ID: process.env.PRIVY_APP_ID ?? "",
  PRIVY_APP_SECRET: process.env.PRIVY_APP_SECRET ?? "",
} as const;

export const MAX_HISTORY = 20;

export const SOL_MINT = "So11111111111111111111111111111111111111112";

export const CG_PRICE_IDS: Record<string, string> = {
  [SOL_MINT]: "solana",
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "usd-coin",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "tether",
};
