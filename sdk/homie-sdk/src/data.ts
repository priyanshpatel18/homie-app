import { request } from "./client";
import type {
  Portfolio,
  ChartData,
  ChartRange,
  SentimentResult,
  RateInfo,
} from "./types";

// ─── Portfolio ───────────────────────────────────────────────────────────────

/**
 * Fetch wallet portfolio (SOL balance + token holdings).
 */
export async function fetchPortfolio(
  walletAddress: string,
  network: "mainnet" | "devnet" = "mainnet",
): Promise<Portfolio> {
  return request<Portfolio>(
    `/api/portfolio/${walletAddress}?network=${network}`,
  );
}

// ─── Prices ──────────────────────────────────────────────────────────────────

/**
 * Fetch prices for one or more token mints.
 * Returns `{ [mint]: priceUsd }`.
 */
export async function fetchPrices(
  mints: string[],
): Promise<Record<string, number>> {
  return request<Record<string, number>>(
    `/api/prices?mints=${mints.join(",")}`,
  );
}

// ─── Charts ──────────────────────────────────────────────────────────────────

/**
 * Fetch historical price chart for a token.
 */
export async function fetchChart(
  token: string,
  range: ChartRange,
): Promise<ChartData> {
  return request<ChartData>(`/api/chart/${token}/${range}`);
}

// ─── Rates ───────────────────────────────────────────────────────────────────

/**
 * Fetch live yield rates across all supported protocols.
 */
export async function fetchRates(): Promise<RateInfo[]> {
  return request<RateInfo[]>("/api/rates");
}

// ─── Sentiment ───────────────────────────────────────────────────────────────

/**
 * Get AI-generated sentiment analysis for a token.
 */
export async function fetchSentiment(
  token: string,
  mint?: string,
): Promise<SentimentResult> {
  const query = mint ? `?mint=${mint}` : "";
  return request<SentimentResult>(`/api/sentiment/${token}${query}`);
}

// ─── Embeddings ──────────────────────────────────────────────────────────────

/**
 * Get a text embedding vector (1536-dim) for semantic search.
 */
export async function fetchEmbedding(
  text: string,
): Promise<{ embedding: number[] }> {
  return request<{ embedding: number[] }>("/api/embed", { body: { text } });
}
