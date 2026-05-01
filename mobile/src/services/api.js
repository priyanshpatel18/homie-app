// Priority: EXPO_PUBLIC_API_URL env var → Android emulator fallback
// Set EXPO_PUBLIC_API_URL in homie-app/.env for real devices (e.g. http://192.168.1.x:4000)
export const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://10.0.2.2:4000";

import {
  chat,
  chatStream,
  fetchPortfolio as sdkFetchPortfolio,
  fetchChart,
} from "@homie/sdk";

export async function askHomie(message, wallet = {}, conversationHistory = [], signal) {
  return chat({ message, wallet, conversationHistory }, signal);
}

/**
 * Streaming version of askHomie. Returns the final agent response;
 * onStatus is invoked for each progress event.
 */
export function askHomieStream(message, wallet = {}, conversationHistory = [], onStatus, signal) {
  return chatStream(
    { message, wallet, conversationHistory },
    onStatus ? { onStatus } : {},
    signal,
  );
}

export async function fetchTokenChartRange(symbol, range) {
  return fetchChart(symbol, range);
}

export async function fetchPortfolio(walletAddress, network = "mainnet") {
  return sdkFetchPortfolio(walletAddress, network);
}
