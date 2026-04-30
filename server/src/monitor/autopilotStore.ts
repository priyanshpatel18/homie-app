// @ts-nocheck
const db = require("../db/database");

const STRATEGY_TARGETS = {
  yield:        { liquid: 10, staked: 60, lending: 30 },
  balanced:     { liquid: 40, staked: 40, lending: 20 },
  preservation: { liquid: 70, staked: 20, lending: 10 },
  aggressive:   { liquid: 5,  staked: 70, lending: 25 },
};

function setAutopilot(walletAddress, config) {
  if (!config || !config.enabled) {
    db.prepare("DELETE FROM autopilot WHERE wallet = ?").run(walletAddress);
    return;
  }
  const data = { ...config, walletAddress, savedAt: Date.now() };
  db.prepare(`
    INSERT INTO autopilot (wallet, config_json, saved_at) VALUES (?, ?, ?)
    ON CONFLICT(wallet) DO UPDATE SET config_json = excluded.config_json, saved_at = excluded.saved_at
  `).run(walletAddress, JSON.stringify(data), data.savedAt);
}

function getAutopilot(walletAddress) {
  const row = db.prepare(
    "SELECT config_json FROM autopilot WHERE wallet = ?"
  ).get(walletAddress);
  return row ? JSON.parse(row.config_json) : null;
}

function getAllActive() {
  return db.prepare("SELECT config_json FROM autopilot")
    .all()
    .map((r) => JSON.parse(r.config_json))
    .filter((c) => c.enabled);
}

function getTargets(strategyId) {
  return STRATEGY_TARGETS[strategyId] ?? STRATEGY_TARGETS.balanced;
}

module.exports = { setAutopilot, getAutopilot, getAllActive, getTargets };