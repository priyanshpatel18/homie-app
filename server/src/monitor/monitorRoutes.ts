// @ts-nocheck
/**
 * monitorRoutes.js — REST endpoints for position tracking, activity log, and agent settings.
 *
 * Positions:
 *   POST   /api/monitor/positions                      — register a position
 *   GET    /api/monitor/positions/:wallet              — list active positions
 *   DELETE /api/monitor/positions/:wallet/:positionId  — close a position
 *
 * Activity log (transparency layer):
 *   GET    /api/monitor/activity/:wallet               — get activity log
 *   POST   /api/monitor/activity                       — log an entry (from app after tx confirms)
 *   PATCH  /api/monitor/activity/:wallet/:id           — update status/signature after tx confirms
 *
 * Agent settings (trust controls):
 *   GET    /api/monitor/settings/:wallet               — get agent settings
 *   POST   /api/monitor/settings/:wallet               — save agent settings
 *
 * Autopilot:
 *   POST   /api/monitor/autopilot                      — save autopilot config
 *   GET    /api/monitor/autopilot/:wallet              — get autopilot config
 */

const express = require("express");
const { registerPosition, closePosition, getPositions } = require("./positionStore");
const { setAutopilot, getAutopilot }                    = require("./autopilotStore");
const { logActivity, updateActivity, getActivityLog }   = require("./activityLog");
const { getSettings, saveSettings }                     = require("./agentSettings");
const { requireAuth }                                   = require("../middleware/auth");
const { requireWalletOwnership }                        = require("../middleware/walletOwnership");

const router = express.Router();

router.use(requireAuth, requireWalletOwnership);

// ─── Positions ────────────────────────────────────────────────────────────────

router.post("/positions", (req, res) => {
  try {
    const {
      walletAddress, protocol, pair, action,
      amountUsd, entrySolPrice, entryRiskScore,
      entryApy, rangeLow, rangeHigh,
    } = req.body;

    if (!walletAddress || !protocol) {
      return res.status(400).json({ error: "walletAddress and protocol are required" });
    }

    const position = registerPosition(walletAddress, {
      protocol, pair, action,
      amountUsd:      Number(amountUsd)      || 0,
      entrySolPrice:  Number(entrySolPrice)  || 0,
      entryRiskScore: Number(entryRiskScore) || 0,
      entryApy:       entryApy  != null ? Number(entryApy)  : null,
      rangeLow:       rangeLow  != null ? Number(rangeLow)  : null,
      rangeHigh:      rangeHigh != null ? Number(rangeHigh) : null,
    });

    res.json({ success: true, position });
  } catch (err) {
    console.error("[Monitor] Register error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/positions/:walletAddress", (req, res) => {
  try {
    const positions = getPositions(req.params.walletAddress);
    res.json({ count: positions.length, positions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/positions/:walletAddress/:positionId", (req, res) => {
  try {
    const { walletAddress, positionId } = req.params;
    const result = closePosition(walletAddress, positionId);
    if (!result.success) return res.status(404).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Activity log ─────────────────────────────────────────────────────────────

router.get("/activity/:walletAddress", (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "30"), 100);
    const entries = getActivityLog(req.params.walletAddress, limit);
    res.json({ count: entries.length, entries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// App calls this after a tx confirms (or fails) to record it in the log
router.post("/activity", (req, res) => {
  try {
    const { walletAddress, ...data } = req.body;
    if (!walletAddress) return res.status(400).json({ error: "walletAddress required" });
    const entry = logActivity(walletAddress, data);
    res.json({ success: true, entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update status + txSignature after a tx lands on-chain
router.patch("/activity/:walletAddress/:id", (req, res) => {
  try {
    const { walletAddress, id } = req.params;
    const entry = updateActivity(walletAddress, id, req.body);
    if (!entry) return res.status(404).json({ error: "Activity entry not found" });
    res.json({ success: true, entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Agent settings ───────────────────────────────────────────────────────────

router.get("/settings/:walletAddress", (req, res) => {
  try {
    const settings = getSettings(req.params.walletAddress);
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/settings/:walletAddress", (req, res) => {
  try {
    const settings = saveSettings(req.params.walletAddress, req.body);
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Autopilot ────────────────────────────────────────────────────────────────

router.post("/autopilot", (req, res) => {
  try {
    const { walletAddress, config } = req.body;
    if (!walletAddress) return res.status(400).json({ error: "walletAddress required" });
    setAutopilot(walletAddress, config || null);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/autopilot/:walletAddress", (req, res) => {
  try {
    const config = getAutopilot(req.params.walletAddress);
    res.json({ config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;