import db from "./database";
import { MAX_HISTORY } from "../config/env";
import type { ChatHistoryEntry } from "../types/chat";

const insertMsg = db.prepare(
  "INSERT INTO conversations (wallet, role, content, created_at) VALUES (?, ?, ?, ?)"
);

const trimConv = db.prepare(`
  DELETE FROM conversations
  WHERE wallet = ? AND id NOT IN (
    SELECT id FROM conversations WHERE wallet = ? ORDER BY created_at DESC LIMIT ?
  )
`);

const selectHistory = db.prepare(`
  SELECT role, content FROM conversations
  WHERE wallet = ? ORDER BY created_at ASC LIMIT ?
`);

export function getHistory(walletAddress?: string): ChatHistoryEntry[] {
  if (!walletAddress) return [];
  const rows = selectHistory.all(walletAddress, MAX_HISTORY) as ChatHistoryEntry[];
  return rows.map((r) => ({ role: r.role, content: r.content }));
}

export function pushHistory(
  walletAddress: string | undefined,
  userMsg: string,
  assistantMsg: unknown
): void {
  if (!walletAddress) return;
  const now = Date.now();
  insertMsg.run(walletAddress, "user", userMsg, now);
  insertMsg.run(walletAddress, "assistant", JSON.stringify(assistantMsg), now + 1);
  trimConv.run(walletAddress, walletAddress, MAX_HISTORY);
}
