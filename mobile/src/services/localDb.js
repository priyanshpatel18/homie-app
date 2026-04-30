/**
 * localDb.js — SQLite-backed local storage for the Homie app.
 *
 * Replaces AsyncStorage in chatStorage.js for conversation and trade history.
 * Uses expo-sqlite v15 (async API).
 *
 * Tables:
 *   conv_index  — lightweight metadata list (title, preview, updatedAt)
 *   conv_data   — full message + history JSON keyed by conv id
 *   trades      — trade history per wallet
 */

import * as SQLite from "expo-sqlite";

let _db = null;

async function getDb() {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync("homie_local.db");
  await _db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS conv_index (
      id          TEXT    NOT NULL,
      wallet      TEXT    NOT NULL,
      title       TEXT    NOT NULL DEFAULT '',
      preview     TEXT    NOT NULL DEFAULT '',
      msg_count   INTEGER NOT NULL DEFAULT 0,
      updated_at  TEXT    NOT NULL,
      PRIMARY KEY (id, wallet)
    );
    CREATE INDEX IF NOT EXISTS idx_ci_wallet ON conv_index(wallet, updated_at DESC);

    CREATE TABLE IF NOT EXISTS conv_data (
      id      TEXT PRIMARY KEY,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trades (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet      TEXT    NOT NULL,
      payload     TEXT    NOT NULL,
      executed_at TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_trades_wallet ON trades(wallet, executed_at DESC);
  `);
  return _db;
}

// ─── Conversations ─────────────────────────────────────────────────────────────

export async function saveConversation(walletAddress, { id, messages, conversationHistory }) {
  try {
    const db = await getDb();

    const firstUserMsg = messages.find((m) => m.role === "user");
    const title = firstUserMsg
      ? firstUserMsg.text.slice(0, 60) + (firstUserMsg.text.length > 60 ? "…" : "")
      : "New conversation";
    const lastHomie = [...messages].reverse().find((m) => m.role === "homie");
    const preview = lastHomie?.text?.slice(0, 80) ?? "";
    const msgCount = messages.filter((m) => m.role === "user").length;
    const updatedAt = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO conv_index (id, wallet, title, preview, msg_count, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id, wallet) DO UPDATE SET
         title = excluded.title, preview = excluded.preview,
         msg_count = excluded.msg_count, updated_at = excluded.updated_at`,
      [id, walletAddress, title, preview, msgCount, updatedAt],
    );

    await db.runAsync(
      `INSERT INTO conv_data (id, payload) VALUES (?, ?)
       ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`,
      [id, JSON.stringify({ messages, conversationHistory })],
    );

    // Cap at 50 conversations per wallet
    await db.runAsync(
      `DELETE FROM conv_index WHERE wallet = ? AND id NOT IN (
         SELECT id FROM conv_index WHERE wallet = ? ORDER BY updated_at DESC LIMIT 50
       )`,
      [walletAddress, walletAddress],
    );
  } catch (e) {
    console.warn("[localDb] saveConversation:", e.message);
  }
}

export async function listConversations(walletAddress) {
  try {
    const db = await getDb();
    const rows = await db.getAllAsync(
      "SELECT id, title, preview, msg_count, updated_at FROM conv_index WHERE wallet = ? ORDER BY updated_at DESC",
      [walletAddress],
    );
    return rows.map((r) => ({
      id:           r.id,
      title:        r.title,
      preview:      r.preview,
      messageCount: r.msg_count,
      updatedAt:    r.updated_at,
    }));
  } catch {
    return [];
  }
}

export async function loadConversation(id) {
  try {
    const db = await getDb();
    const row = await db.getFirstAsync("SELECT payload FROM conv_data WHERE id = ?", [id]);
    return row ? JSON.parse(row.payload) : null;
  } catch {
    return null;
  }
}

export async function deleteConversation(walletAddress, id) {
  try {
    const db = await getDb();
    await db.runAsync("DELETE FROM conv_index WHERE id = ? AND wallet = ?", [id, walletAddress]);
    // Only delete conv_data if no other wallet references it (shared id is unlikely but safe)
    const still = await db.getFirstAsync("SELECT 1 FROM conv_index WHERE id = ?", [id]);
    if (!still) await db.runAsync("DELETE FROM conv_data WHERE id = ?", [id]);
  } catch (e) {
    console.warn("[localDb] deleteConversation:", e.message);
  }
}

export async function loadLatestHistory(walletAddress) {
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

export function newConversationId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Trades ────────────────────────────────────────────────────────────────────

export async function saveTrade(walletAddress, trade) {
  try {
    const db = await getDb();
    const executedAt = trade.executedAt || new Date().toISOString();
    await db.runAsync(
      "INSERT INTO trades (wallet, payload, executed_at) VALUES (?, ?, ?)",
      [walletAddress, JSON.stringify({ ...trade, executedAt }), executedAt],
    );
    // Keep last 200 per wallet
    await db.runAsync(
      `DELETE FROM trades WHERE wallet = ? AND id NOT IN (
         SELECT id FROM trades WHERE wallet = ? ORDER BY executed_at DESC LIMIT 200
       )`,
      [walletAddress, walletAddress],
    );
  } catch (e) {
    console.warn("[localDb] saveTrade:", e.message);
  }
}

export async function listTrades(walletAddress) {
  try {
    const db = await getDb();
    const rows = await db.getAllAsync(
      "SELECT payload FROM trades WHERE wallet = ? ORDER BY executed_at DESC",
      [walletAddress],
    );
    return rows.map((r) => JSON.parse(r.payload));
  } catch {
    return [];
  }
}
