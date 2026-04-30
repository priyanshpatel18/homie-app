// @ts-nocheck
/**
 * Push Notification & Alert Routes
 * Handles token registration and alert subscription endpoints.
 */

const express = require("express");
const {
  registerToken,
  createAlert,
  removeAlert,
  getAlerts,
  sendAlertConfirmation,
} = require("./pushService");

const router = express.Router();

// ─── Register push token ────────────────────────────────────────────────────
router.post("/push/register", (req, res) => {
  try {
    const { walletAddress, pushToken } = req.body;

    if (!walletAddress || !pushToken) {
      return res.status(400).json({ error: "walletAddress and pushToken required" });
    }

    const result = registerToken(walletAddress, pushToken);
    res.json(result);
  } catch (err) {
    console.error("[Push] Registration error:", err.message);
    res.status(400).json({ error: err.message });
  }
});

// ─── Subscribe to alert ─────────────────────────────────────────────────────
router.post("/alerts/subscribe", async (req, res) => {
  try {
    const { walletAddress, alert } = req.body;

    if (!walletAddress || !alert) {
      return res.status(400).json({ error: "walletAddress and alert required" });
    }

    const result = createAlert(walletAddress, alert);

    // Send a confirmation push notification
    if (result.success && !result.duplicate) {
      sendAlertConfirmation(walletAddress, result.alert).catch(() => {});
    }

    res.json(result);
  } catch (err) {
    console.error("[Alert] Subscribe error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Unsubscribe from alert ─────────────────────────────────────────────────
router.post("/alerts/unsubscribe", (req, res) => {
  try {
    const { walletAddress, alertId } = req.body;

    if (!walletAddress || !alertId) {
      return res.status(400).json({ error: "walletAddress and alertId required" });
    }

    const result = removeAlert(walletAddress, alertId);
    res.json(result);
  } catch (err) {
    console.error("[Alert] Unsubscribe error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Get active alerts ──────────────────────────────────────────────────────
router.get("/alerts/:walletAddress", (req, res) => {
  try {
    const { walletAddress } = req.params;
    if (!walletAddress) {
      return res.status(400).json({ error: "walletAddress required" });
    }

    const alerts = getAlerts(walletAddress);
    res.json(alerts);
  } catch (err) {
    console.error("[Alert] Fetch error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;