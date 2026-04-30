// @ts-nocheck
/**
 * Push Notification Service
 * Handles Expo push notifications for the "Alert Me" feature.
 * 
 * In production, replace the in-memory stores with a database (Redis, PostgreSQL, etc.)
 */

const { Expo } = require("expo-server-sdk");

const expo = new Expo();

// ─── In-memory stores (swap for DB in production) ────────────────────────────

// Map<walletAddress, pushToken>
const pushTokens = new Map();

// Map<walletAddress, Alert[]>
// Alert: { id, protocol, action, condition, conditionValue, createdAt, active }
const userAlerts = new Map();

// ─── Token Management ────────────────────────────────────────────────────────

function registerToken(walletAddress, pushToken) {
  if (!Expo.isExpoPushToken(pushToken)) {
    throw new Error(`Invalid Expo push token: ${pushToken}`);
  }
  pushTokens.set(walletAddress, pushToken);
  console.log(`[Push] Registered token for ${walletAddress.slice(0, 8)}...`);
  return { success: true };
}

function getToken(walletAddress) {
  return pushTokens.get(walletAddress) || null;
}

// ─── Alert Management ────────────────────────────────────────────────────────

function createAlert(walletAddress, alertData) {
  const alert = {
    id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    protocol: alertData.protocol || "Unknown",
    action: alertData.action || "",
    condition: alertData.condition || "apy_change",
    conditionValue: alertData.conditionValue || null,
    estimatedApy: alertData.estimatedApy || null,
    risk: alertData.risk || null,
    createdAt: new Date().toISOString(),
    active: true,
  };

  const alerts = userAlerts.get(walletAddress) || [];
  
  // Prevent duplicates — same protocol + condition
  const existing = alerts.find(
    (a) => a.protocol === alert.protocol && a.condition === alert.condition && a.active
  );
  if (existing) {
    return { success: true, alert: existing, duplicate: true };
  }

  alerts.push(alert);
  userAlerts.set(walletAddress, alerts);
  console.log(`[Alert] Created "${alert.protocol}" alert for ${walletAddress.slice(0, 8)}...`);
  return { success: true, alert, duplicate: false };
}

function removeAlert(walletAddress, alertId) {
  const alerts = userAlerts.get(walletAddress) || [];
  const idx = alerts.findIndex((a) => a.id === alertId);
  if (idx === -1) return { success: false, error: "Alert not found" };

  alerts[idx].active = false;
  userAlerts.set(walletAddress, alerts);
  console.log(`[Alert] Removed alert ${alertId} for ${walletAddress.slice(0, 8)}...`);
  return { success: true };
}

function getAlerts(walletAddress) {
  const alerts = userAlerts.get(walletAddress) || [];
  return alerts.filter((a) => a.active);
}

// ─── Sending Notifications ───────────────────────────────────────────────────

async function sendPushNotification(walletAddress, title, body, data = {}) {
  const token = getToken(walletAddress);
  if (!token) {
    console.log(`[Push] No token for wallet ${walletAddress.slice(0, 8)}...`);
    return null;
  }

  const message = {
    to: token,
    sound: "default",
    title,
    body,
    data,
    channelId: "alerts",
    priority: "high",
  };

  try {
    const chunks = expo.chunkPushNotifications([message]);
    const tickets = [];

    for (const chunk of chunks) {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
    }

    console.log(`[Push] Sent notification to ${walletAddress.slice(0, 8)}...: "${title}"`);
    return tickets;
  } catch (err) {
    console.error(`[Push] Error sending to ${walletAddress.slice(0, 8)}...:`, err.message);
    return null;
  }
}

/**
 * Send a notification to all wallets that have an active alert for a given protocol
 */
async function notifyProtocolAlerts(protocol, title, body, extraData = {}) {
  const results = [];

  for (const [wallet, alerts] of userAlerts.entries()) {
    const activeAlerts = alerts.filter(
      (a) => a.active && a.protocol.toLowerCase() === protocol.toLowerCase()
    );
    if (activeAlerts.length > 0) {
      const result = await sendPushNotification(wallet, title, body, {
        type: "alert",
        protocol,
        ...extraData,
      });
      results.push({ wallet: wallet.slice(0, 8) + "...", result });
    }
  }

  return results;
}

/**
 * Send confirmation notification when user subscribes
 */
async function sendAlertConfirmation(walletAddress, alert) {
  const title = "🔔 Alert Set!";
  const body = `You'll be notified about ${alert.protocol} changes.${
    alert.estimatedApy ? ` Current APY: ${alert.estimatedApy}` : ""
  }`;

  return await sendPushNotification(walletAddress, title, body, {
    type: "alert_confirmation",
    alertId: alert.id,
  });
}

module.exports = {
  registerToken,
  getToken,
  createAlert,
  removeAlert,
  getAlerts,
  sendPushNotification,
  notifyProtocolAlerts,
  sendAlertConfirmation,
};