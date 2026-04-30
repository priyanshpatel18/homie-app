/**
 * chatStorage — persists conversations and trade history per wallet.
 *
 * Primary store: localDb (expo-sqlite).
 * Fallback:      AsyncStorage (used automatically if SQLite init fails).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as localDb from "./localDb";

// ─── Key helpers (AsyncStorage fallback) ─────────────────────────────────────
const INDEX_KEY  = (wallet) => `@homie_conv_index_${wallet}`;
const CONV_KEY   = (id)     => `@homie_conv_${id}`;
const TRADES_KEY = (wallet) => `@homie_trades_${wallet}`;

// Track whether SQLite is available (set to false if first call throws)
let _sqliteOk = true;

async function sqliteAvailable() {
  if (!_sqliteOk) return false;
  try {
    // Trigger DB init — will throw if expo-sqlite isn't installed
    await localDb.listConversations("__ping__");
    return true;
  } catch {
    _sqliteOk = false;
    return false;
  }
}

// ─── Conversations ────────────────────────────────────────────────────────────

export function newConversationId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function saveConversation(walletAddress, { id, messages, conversationHistory }) {
  if (await sqliteAvailable()) {
    return localDb.saveConversation(walletAddress, { id, messages, conversationHistory });
  }

  // AsyncStorage fallback
  try {
    const firstUserMsg = messages.find((m) => m.role === "user");
    const title = firstUserMsg
      ? firstUserMsg.text.slice(0, 60) + (firstUserMsg.text.length > 60 ? "…" : "")
      : "New conversation";
    const lastMsg = [...messages].reverse().find((m) => m.role === "homie");
    const meta = {
      id, title,
      preview:      lastMsg?.text?.slice(0, 80) ?? "",
      messageCount: messages.filter((m) => m.role === "user").length,
      updatedAt:    new Date().toISOString(),
    };
    const raw = await AsyncStorage.getItem(INDEX_KEY(walletAddress));
    let index = raw ? JSON.parse(raw) : [];
    index = index.filter((c) => c.id !== id);
    index.unshift(meta);
    if (index.length > 50) index = index.slice(0, 50);
    await Promise.all([
      AsyncStorage.setItem(INDEX_KEY(walletAddress), JSON.stringify(index)),
      AsyncStorage.setItem(CONV_KEY(id), JSON.stringify({ messages, conversationHistory })),
    ]);
  } catch (e) {
    console.warn("[chatStorage] saveConversation:", e.message);
  }
}

export async function listConversations(walletAddress) {
  if (await sqliteAvailable()) {
    return localDb.listConversations(walletAddress);
  }
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY(walletAddress));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function loadConversation(id) {
  if (await sqliteAvailable()) {
    return localDb.loadConversation(id);
  }
  try {
    const raw = await AsyncStorage.getItem(CONV_KEY(id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function deleteConversation(walletAddress, id) {
  if (await sqliteAvailable()) {
    return localDb.deleteConversation(walletAddress, id);
  }
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY(walletAddress));
    let index = raw ? JSON.parse(raw) : [];
    index = index.filter((c) => c.id !== id);
    await Promise.all([
      AsyncStorage.setItem(INDEX_KEY(walletAddress), JSON.stringify(index)),
      AsyncStorage.removeItem(CONV_KEY(id)),
    ]);
  } catch (e) {
    console.warn("[chatStorage] deleteConversation:", e.message);
  }
}

export async function loadLatestHistory(walletAddress) {
  if (await sqliteAvailable()) {
    return localDb.loadLatestHistory(walletAddress);
  }
  try {
    const index = await listConversations(walletAddress);
    if (!index.length) return null;
    const latest = index[0];
    const conv = await loadConversation(latest.id);
    if (!conv?.conversationHistory?.length) return null;
    return {
      id:                  latest.id,
      conversationHistory: conv.conversationHistory.slice(-20),
      meta:                latest,
    };
  } catch {
    return null;
  }
}

// ─── Trade history ────────────────────────────────────────────────────────────

export async function saveTrade(walletAddress, trade) {
  if (await sqliteAvailable()) {
    return localDb.saveTrade(walletAddress, trade);
  }
  try {
    const raw = await AsyncStorage.getItem(TRADES_KEY(walletAddress));
    let trades = raw ? JSON.parse(raw) : [];
    trades.unshift({ ...trade, executedAt: trade.executedAt || new Date().toISOString() });
    if (trades.length > 200) trades = trades.slice(0, 200);
    await AsyncStorage.setItem(TRADES_KEY(walletAddress), JSON.stringify(trades));
  } catch (e) {
    console.warn("[chatStorage] saveTrade:", e.message);
  }
}

export async function listTrades(walletAddress) {
  if (await sqliteAvailable()) {
    return localDb.listTrades(walletAddress);
  }
  try {
    const raw = await AsyncStorage.getItem(TRADES_KEY(walletAddress));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
