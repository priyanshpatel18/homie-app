// @ts-nocheck
const db = require("../db/database");

const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

// ─── Row mapper ───────────────────────────────────────────────────────────────

function rowToPosition(row) {
  return {
    id:             row.id,
    walletAddress:  row.wallet,
    protocol:       row.protocol,
    pair:           row.pair,
    action:         row.action,
    amountUsd:      row.amount_usd,
    entrySolPrice:  row.entry_sol_price,
    entryRiskScore: row.entry_risk_score,
    entryApy:       row.entry_apy,
    rangeLow:       row.range_low,
    rangeHigh:      row.range_high,
    leverageData:   row.leverage_data  ? JSON.parse(row.leverage_data)  : null,
    lastAlertAt:    row.last_alert_at  ? JSON.parse(row.last_alert_at)  : {},
    createdAt:      row.created_at,
    active:         row.active === 1,
  };
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

function registerPosition(walletAddress, data) {
  const position = {
    id:             `pos_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    walletAddress,
    protocol:       data.protocol       || "Unknown",
    pair:           data.pair           || "",
    action:         data.action         || "lend",
    amountUsd:      data.amountUsd      || 0,
    entrySolPrice:  data.entrySolPrice  || 0,
    entryRiskScore: data.entryRiskScore || 0,
    entryApy:       data.entryApy       ?? null,
    rangeLow:       data.rangeLow       ?? null,
    rangeHigh:      data.rangeHigh      ?? null,
    leverageData:   data.leverageData   ?? null,
    createdAt:      Date.now(),
    lastAlertAt:    { sol_drop: null, risk_drop: null, scam: null, liq_warning: null, liq_critical: null, out_of_range: null, apy_drop: null },
    active:         true,
  };

  db.prepare(`
    INSERT INTO positions
      (id, wallet, protocol, pair, action, amount_usd, entry_sol_price, entry_risk_score,
       entry_apy, range_low, range_high, leverage_data, last_alert_at, created_at, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    position.id, walletAddress, position.protocol, position.pair, position.action,
    position.amountUsd, position.entrySolPrice, position.entryRiskScore,
    position.entryApy, position.rangeLow, position.rangeHigh,
    position.leverageData ? JSON.stringify(position.leverageData) : null,
    JSON.stringify(position.lastAlertAt), position.createdAt,
  );

  console.log(`[Monitor] Registered position ${position.id}: ${position.protocol} ${position.pair} for ${walletAddress.slice(0, 8)}...`);
  return position;
}

function closePosition(walletAddress, positionId) {
  const result = db.prepare(
    "UPDATE positions SET active = 0 WHERE id = ? AND wallet = ?"
  ).run(positionId, walletAddress);
  if (result.changes === 0) return { success: false, error: "Position not found" };
  return { success: true };
}

function getPositions(walletAddress) {
  return db.prepare(
    "SELECT * FROM positions WHERE wallet = ? AND active = 1"
  ).all(walletAddress).map(rowToPosition);
}

function getAllActivePositions() {
  return db.prepare(
    "SELECT * FROM positions WHERE active = 1"
  ).all().map(rowToPosition);
}

// ─── Alert cooldown ───────────────────────────────────────────────────────────

function canAlert(position, type) {
  const last = position.lastAlertAt[type];
  return !last || Date.now() - last > ALERT_COOLDOWN_MS;
}

function markAlerted(position, type) {
  position.lastAlertAt[type] = Date.now();
  db.prepare("UPDATE positions SET last_alert_at = ? WHERE id = ?")
    .run(JSON.stringify(position.lastAlertAt), position.id);
}

module.exports = {
  registerPosition,
  closePosition,
  getPositions,
  getAllActivePositions,
  canAlert,
  markAlerted,
};