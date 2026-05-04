import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DATA_DIR = path.join(__dirname, "..", "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db: Database.Database = new Database(path.join(DATA_DIR, "homie.db"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet     TEXT    NOT NULL,
    role       TEXT    NOT NULL,
    content    TEXT    NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
  );
  CREATE INDEX IF NOT EXISTS idx_conv_wallet_time ON conversations(wallet, created_at);

  CREATE TABLE IF NOT EXISTS positions (
    id               TEXT    PRIMARY KEY,
    wallet           TEXT    NOT NULL,
    protocol         TEXT    NOT NULL DEFAULT 'Unknown',
    pair             TEXT    NOT NULL DEFAULT '',
    action           TEXT    NOT NULL DEFAULT 'lend',
    amount_usd       REAL    NOT NULL DEFAULT 0,
    entry_sol_price  REAL    NOT NULL DEFAULT 0,
    entry_risk_score REAL    NOT NULL DEFAULT 0,
    entry_apy        REAL,
    range_low        REAL,
    range_high       REAL,
    leverage_data    TEXT,
    last_alert_at    TEXT    NOT NULL DEFAULT '{}',
    created_at       INTEGER NOT NULL,
    active           INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS idx_pos_wallet  ON positions(wallet);
  CREATE INDEX IF NOT EXISTS idx_pos_active  ON positions(active);

  CREATE TABLE IF NOT EXISTS activity_log (
    id            TEXT    PRIMARY KEY,
    wallet        TEXT    NOT NULL,
    type          TEXT    NOT NULL DEFAULT 'user_action',
    protocol      TEXT    NOT NULL DEFAULT 'Unknown',
    action        TEXT    NOT NULL DEFAULT '',
    amount_usd    REAL,
    reason        TEXT,
    status        TEXT    NOT NULL DEFAULT 'pending',
    tx_signature  TEXT,
    timestamp     INTEGER NOT NULL,
    auto_executed INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_act_wallet_time ON activity_log(wallet, timestamp DESC);

  CREATE TABLE IF NOT EXISTS agent_settings (
    wallet        TEXT PRIMARY KEY,
    settings_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS autopilot (
    wallet      TEXT    PRIMARY KEY,
    config_json TEXT    NOT NULL,
    saved_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS daily_spend (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet     TEXT    NOT NULL,
    amount_usd REAL    NOT NULL,
    ts         INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_spend_wallet_ts ON daily_spend(wallet, ts);

  CREATE TABLE IF NOT EXISTS playbooks (
    id            TEXT    PRIMARY KEY,
    wallet        TEXT    NOT NULL,
    config_json   TEXT    NOT NULL,
    active        INTEGER NOT NULL DEFAULT 1,
    authorized_at INTEGER NOT NULL,
    last_fired_at INTEGER,
    created_at    INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_playbooks_wallet ON playbooks(wallet, active);

  CREATE TABLE IF NOT EXISTS user_preferences (
    wallet     TEXT    PRIMARY KEY,
    goal       TEXT    NOT NULL,
    verbosity  TEXT    NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS personas (
    wallet     TEXT    PRIMARY KEY,
    goal       TEXT    NOT NULL,
    verbosity  TEXT    NOT NULL,
    risk       TEXT    NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

export = db;
