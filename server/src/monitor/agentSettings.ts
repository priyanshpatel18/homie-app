// @ts-nocheck
/**
 * agentSettings.js — per-wallet agent control settings.
 *
 * Risk matrix (enforced here, not just in prompts):
 *   compoundRewards    — Very Low  — auto always OK
 *   rebalanceLp        — Low       — auto with notification
 *   moveBetweenLending — Medium    — notify + 10-min cancel window
 *   autoRepay          — Med-High  — auto but alert immediately after
 *   closePosition      — High      — NEVER auto (hardcoded off)
 *   unwindLeverage     — High      — NEVER auto (hardcoded off)
 *   largeTx (>$1000)   — High      — NEVER auto (hardcoded off)
 */

const db = require("../db/database");

const DEFAULTS = {
  isPaused:       false,
  spendingCapUsd: 500,
  dailyCapUsd:    2000,
  autoExecute: {
    compoundRewards:    true,
    rebalanceLp:        true,
    moveBetweenLending: false,
    autoRepay:          false,
  },
};

// HARDCODED — always false regardless of user setting
const ALWAYS_MANUAL = new Set(["closePosition", "unwindLeverage", "largeTx"]);

// ─── Settings ─────────────────────────────────────────────────────────────────

function getSettings(walletAddress) {
  const row = db.prepare(
    "SELECT settings_json FROM agent_settings WHERE wallet = ?"
  ).get(walletAddress);
  if (!row) return { ...DEFAULTS, autoExecute: { ...DEFAULTS.autoExecute } };
  const saved = JSON.parse(row.settings_json);
  return {
    ...DEFAULTS,
    ...saved,
    autoExecute: { ...DEFAULTS.autoExecute, ...(saved.autoExecute || {}) },
  };
}

function saveSettings(walletAddress, updates) {
  const current = getSettings(walletAddress);
  const next = {
    ...current,
    ...updates,
    autoExecute: { ...current.autoExecute, ...(updates.autoExecute || {}) },
  };
  for (const k of ALWAYS_MANUAL) delete next.autoExecute[k];
  db.prepare(`
    INSERT INTO agent_settings (wallet, settings_json) VALUES (?, ?)
    ON CONFLICT(wallet) DO UPDATE SET settings_json = excluded.settings_json
  `).run(walletAddress, JSON.stringify(next));
  return next;
}

// ─── Spend tracking ───────────────────────────────────────────────────────────

function getDailySpent(walletAddress) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const rows = db.prepare(
    "SELECT amount_usd FROM daily_spend WHERE wallet = ? AND ts > ?"
  ).all(walletAddress, cutoff);
  return rows.reduce((s, r) => s + r.amount_usd, 0);
}

function recordSpend(walletAddress, amountUsd) {
  db.prepare(
    "INSERT INTO daily_spend (wallet, amount_usd, ts) VALUES (?, ?, ?)"
  ).run(walletAddress, amountUsd, Date.now());
}

// ─── Authorization check ──────────────────────────────────────────────────────

function canAutoExecute(walletAddress, actionKey, amountUsd = 0) {
  if (ALWAYS_MANUAL.has(actionKey)) {
    return { allowed: false, reason: `${actionKey} always requires manual approval` };
  }

  const s = getSettings(walletAddress);

  if (s.isPaused) {
    return { allowed: false, reason: "Agent is paused — all auto-execute disabled" };
  }

  if (!s.autoExecute[actionKey]) {
    return { allowed: false, reason: `Auto-execute for ${actionKey} is turned off` };
  }

  if (amountUsd > s.spendingCapUsd) {
    return { allowed: false, reason: `Amount $${amountUsd.toFixed(0)} exceeds spending cap $${s.spendingCapUsd}` };
  }

  const dailySpent = getDailySpent(walletAddress);
  if (dailySpent + amountUsd > s.dailyCapUsd) {
    return { allowed: false, reason: `Would exceed daily cap ($${s.dailyCapUsd}). Already auto-spent $${dailySpent.toFixed(0)} today` };
  }

  return { allowed: true, reason: null };
}

module.exports = { getSettings, saveSettings, canAutoExecute, recordSpend, getDailySpent };