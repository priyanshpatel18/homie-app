// @ts-nocheck
const db = require("../db/database");

const MAX_ENTRIES = 100;

function newId() {
  return `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function rowToEntry(row) {
  return {
    id:           row.id,
    walletAddress: row.wallet,
    type:         row.type,
    protocol:     row.protocol,
    action:       row.action,
    amountUsd:    row.amount_usd,
    reason:       row.reason,
    status:       row.status,
    txSignature:  row.tx_signature,
    timestamp:    row.timestamp,
    autoExecuted: row.auto_executed === 1,
  };
}

function logActivity(walletAddress, data) {
  const entry = {
    id:           data.id    || newId(),
    walletAddress,
    type:         data.type         || "user_action",
    protocol:     data.protocol     || "Unknown",
    action:       data.action       || "",
    amountUsd:    data.amountUsd    != null ? Number(data.amountUsd) : null,
    reason:       data.reason       || null,
    status:       data.status       || "pending",
    txSignature:  data.txSignature  || null,
    timestamp:    data.timestamp    || Date.now(),
    autoExecuted: data.autoExecuted || false,
  };

  db.prepare(`
    INSERT INTO activity_log
      (id, wallet, type, protocol, action, amount_usd, reason, status, tx_signature, timestamp, auto_executed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.id, walletAddress, entry.type, entry.protocol, entry.action,
    entry.amountUsd, entry.reason, entry.status, entry.txSignature,
    entry.timestamp, entry.autoExecuted ? 1 : 0,
  );

  // Keep only last MAX_ENTRIES per wallet
  db.prepare(`
    DELETE FROM activity_log
    WHERE wallet = ? AND id NOT IN (
      SELECT id FROM activity_log WHERE wallet = ? ORDER BY timestamp DESC LIMIT ?
    )
  `).run(walletAddress, walletAddress, MAX_ENTRIES);

  return entry;
}

function updateActivity(walletAddress, id, updates) {
  const row = db.prepare(
    "SELECT * FROM activity_log WHERE id = ? AND wallet = ?"
  ).get(id, walletAddress);
  if (!row) return null;

  const fields = [];
  const values = [];
  if (updates.status      !== undefined) { fields.push("status = ?");       values.push(updates.status); }
  if (updates.txSignature !== undefined) { fields.push("tx_signature = ?"); values.push(updates.txSignature); }
  if (updates.reason      !== undefined) { fields.push("reason = ?");       values.push(updates.reason); }
  if (!fields.length) return rowToEntry(row);

  values.push(id, walletAddress);
  db.prepare(`UPDATE activity_log SET ${fields.join(", ")} WHERE id = ? AND wallet = ?`)
    .run(...values);

  return { ...rowToEntry(row), ...updates };
}

function getActivityLog(walletAddress, limit = 30) {
  return db.prepare(
    "SELECT * FROM activity_log WHERE wallet = ? ORDER BY timestamp DESC LIMIT ?"
  ).all(walletAddress, limit).map(rowToEntry);
}

function getAllActivity() {
  return db.prepare(
    "SELECT * FROM activity_log ORDER BY timestamp DESC"
  ).all().map(rowToEntry);
}

module.exports = { logActivity, updateActivity, getActivityLog, getAllActivity };