/**
 * portfolioCache — AsyncStorage persistence for portfolio + USD value.
 * Stored per wallet address. Used to show last-known value instantly on launch.
 *
 * Cache shape: { portfolio, totalUsd, solPrice, savedAt }
 * TTL: 5 minutes — after that, treat as stale and re-fetch.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY  = (addr) => `@portfolio_cache_v1_${addr}`;
const TTL  = 5 * 60 * 1000; // 5 min

/**
 * Load the cached entry. Returns null if missing or expired.
 * Pass `ignoreExpiry: true` to get stale data (e.g., offline fallback).
 */
export async function loadPortfolioCache(walletAddress, { ignoreExpiry = false } = {}) {
  if (!walletAddress) return null;
  try {
    const raw = await AsyncStorage.getItem(KEY(walletAddress));
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (!ignoreExpiry && Date.now() - cached.savedAt > TTL) return null;
    return cached; // { portfolio, totalUsd, solPrice, savedAt }
  } catch {
    return null;
  }
}

/**
 * Persist portfolio snapshot + computed USD values for this wallet.
 */
export async function savePortfolioCache(walletAddress, { portfolio, totalUsd, solPrice }) {
  if (!walletAddress) return;
  try {
    await AsyncStorage.setItem(
      KEY(walletAddress),
      JSON.stringify({ portfolio, totalUsd, solPrice, savedAt: Date.now() })
    );
  } catch {}
}

/**
 * Remove cached data for a wallet (e.g., on logout).
 */
export async function clearPortfolioCache(walletAddress) {
  if (!walletAddress) return;
  try {
    await AsyncStorage.removeItem(KEY(walletAddress));
  } catch {}
}
