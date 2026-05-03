/**
 * playbookStore — CRUD for automated playbooks.
 *
 * A playbook is a named, scope-bounded automation: "if health_factor < 1.15,
 * repay my Kamino loan and swap to USDC". Every playbook requires an explicit
 * authorization before it can fire, and scope (maxAmountUsd, expiresAt) is
 * declared up front — no blank checks.
 */

import db from "../db/database";
import { randomUUID } from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PlaybookType = "move_to_safety" | "dca" | "compound" | "rebalance" | "custom";

export interface PlaybookCondition {
  metric: "health_factor" | "sol_price_usd" | "portfolio_usd" | "time" | "always";
  op:     "<" | ">" | "<=" | ">=" | "==" | "!=";
  value:  number;
}

export interface PlaybookAction {
  tool:   string;       // agent tool name, e.g. "prepare_swap_transaction"
  params: Record<string, unknown>;
  label:  string;       // human-readable, e.g. "Repay Kamino loan"
}

export interface Playbook {
  id:           string;
  wallet:       string;
  name:         string;
  type:         PlaybookType;
  conditions:   PlaybookCondition[];
  actions:      PlaybookAction[];
  maxAmountUsd: number;
  cooldownHours: number;
  expiresAt:    number;   // unix ms — playbook auto-expires
  authorizedAt: number;   // unix ms — when user confirmed
  active:       boolean;
  lastFiredAt:  number | null;
  createdAt:    number;
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

function row_to_playbook(row: Record<string, unknown>): Playbook {
  const cfg = JSON.parse(row.config_json as string);
  return {
    id:           row.id as string,
    wallet:       row.wallet as string,
    name:         cfg.name,
    type:         cfg.type,
    conditions:   cfg.conditions ?? [],
    actions:      cfg.actions ?? [],
    maxAmountUsd: cfg.maxAmountUsd ?? 0,
    cooldownHours: cfg.cooldownHours ?? 24,
    expiresAt:    cfg.expiresAt ?? 0,
    authorizedAt: row.authorized_at as number,
    active:       !!(row.active as number),
    lastFiredAt:  (row.last_fired_at as number) || null,
    createdAt:    row.created_at as number,
  };
}

// ─── Create ───────────────────────────────────────────────────────────────────

export interface CreatePlaybookParams {
  wallet:        string;
  name:          string;
  type:          PlaybookType;
  conditions:    PlaybookCondition[];
  actions:       PlaybookAction[];
  maxAmountUsd:  number;
  cooldownHours?: number;
  durationDays?: number;   // how long the playbook is authorized for (default 30)
}

export function createPlaybook(params: CreatePlaybookParams): Playbook {
  const id          = randomUUID();
  const now         = Date.now();
  const expiresAt   = now + (params.durationDays ?? 30) * 86_400_000;
  const cooldown    = params.cooldownHours ?? 24;

  const config = {
    name:         params.name,
    type:         params.type,
    conditions:   params.conditions,
    actions:      params.actions,
    maxAmountUsd: params.maxAmountUsd,
    cooldownHours: cooldown,
    expiresAt,
  };

  // active=0 — stays pending until user confirms on mobile (authorizePlaybook)
  db.prepare(`
    INSERT INTO playbooks (id, wallet, config_json, active, authorized_at, last_fired_at, created_at)
    VALUES (?, ?, ?, 0, ?, NULL, ?)
  `).run(id, params.wallet, JSON.stringify(config), now, now);

  return row_to_playbook(
    db.prepare("SELECT * FROM playbooks WHERE id = ?").get(id) as Record<string, unknown>
  );
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export function getPlaybooks(wallet: string, includeExpired = false): Playbook[] {
  const now = Date.now();
  const rows = db.prepare(
    "SELECT * FROM playbooks WHERE wallet = ? AND active = 1 ORDER BY created_at DESC"
  ).all(wallet) as Record<string, unknown>[];
  const playbooks = rows.map(row_to_playbook);
  return includeExpired ? playbooks : playbooks.filter(p => p.expiresAt > now);
}

export function getPlaybook(wallet: string, id: string): Playbook | null {
  const row = db.prepare("SELECT * FROM playbooks WHERE id = ? AND wallet = ?").get(id, wallet) as Record<string, unknown> | undefined;
  return row ? row_to_playbook(row) : null;
}

// ─── Authorize (pending → active) ────────────────────────────────────────────

export function authorizePlaybook(wallet: string, id: string): { success: boolean; playbook?: Playbook; message: string } {
  const result = db.prepare(
    "UPDATE playbooks SET active = 1, authorized_at = ? WHERE id = ? AND wallet = ? AND active = 0"
  ).run(Date.now(), id, wallet);
  if (result.changes === 0) return { success: false, message: "Playbook not found or already active/cancelled" };
  const playbook = getPlaybook(wallet, id)!;
  return { success: true, playbook, message: `Playbook "${playbook.name}" is now active` };
}

// ─── Cancel (soft delete) ────────────────────────────────────────────────────

export function cancelPlaybook(wallet: string, id: string): { success: boolean; message: string } {
  const result = db.prepare(
    "UPDATE playbooks SET active = 0 WHERE id = ? AND wallet = ?"
  ).run(id, wallet);
  if (result.changes === 0) return { success: false, message: "Playbook not found or already cancelled" };
  return { success: true, message: "Playbook cancelled" };
}

// ─── Record a fire event ─────────────────────────────────────────────────────

export function recordPlaybookFired(id: string): void {
  db.prepare("UPDATE playbooks SET last_fired_at = ? WHERE id = ?").run(Date.now(), id);
}

// ─── Cooldown check ──────────────────────────────────────────────────────────

export function isOnCooldown(playbook: Playbook): boolean {
  if (!playbook.lastFiredAt) return false;
  const cooldownMs = playbook.cooldownHours * 3_600_000;
  return Date.now() - playbook.lastFiredAt < cooldownMs;
}
