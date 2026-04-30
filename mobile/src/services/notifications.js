import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";

import { API_URL } from "./api";

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Register for push notifications and return the Expo push token.
 * Returns null if running on a simulator or permissions are denied.
 */
export async function registerForPushNotifications() {
  let token = null;

  if (!Device.isDevice) {
    console.log("Push notifications require a physical device.");
    return null;
  }

  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Ask for permissions if not already granted
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("Push notification permission denied.");
    return null;
  }

  // Get the Expo push token
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId,
  });
  token = tokenData.data;

  // Android-specific notification channel
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#4ADE80",
    });

    await Notifications.setNotificationChannelAsync("alerts", {
      name: "Price Alerts",
      description: "Notifications for DeFi strategy alerts",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#60A5FA",
    });
  }

  return token;
}

/**
 * Register push token with the backend server
 */
export async function registerPushToken(walletAddress, pushToken) {
  try {
    const response = await fetch(`${API_URL}/api/push/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress, pushToken }),
    });
    if (!response.ok) throw new Error(`Registration failed: ${response.status}`);
    return await response.json();
  } catch (err) {
    console.error("Push token registration error:", err.message);
    return null;
  }
}

/**
 * Subscribe to an alert for a specific strategy/protocol
 */
export async function subscribeAlert(walletAddress, alert) {
  try {
    const response = await fetch(`${API_URL}/api/alerts/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress, alert }),
    });
    if (!response.ok) throw new Error(`Alert subscribe failed: ${response.status}`);
    return await response.json();
  } catch (err) {
    console.error("Alert subscribe error:", err.message);
    return null;
  }
}

/**
 * Unsubscribe from an alert
 */
export async function unsubscribeAlert(walletAddress, alertId) {
  try {
    const response = await fetch(`${API_URL}/api/alerts/unsubscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress, alertId }),
    });
    if (!response.ok) throw new Error(`Alert unsubscribe failed: ${response.status}`);
    return await response.json();
  } catch (err) {
    console.error("Alert unsubscribe error:", err.message);
    return null;
  }
}

/**
 * Fetch active alerts for a wallet
 */
export async function getActiveAlerts(walletAddress) {
  try {
    const response = await fetch(`${API_URL}/api/alerts/${walletAddress}`, {
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) throw new Error(`Fetch alerts failed: ${response.status}`);
    return await response.json();
  } catch (err) {
    console.error("Fetch alerts error:", err.message);
    return [];
  }
}

/**
 * Register a DeFi position for background monitoring.
 * The server will send push alerts if SOL drops, risk degrades, or scam detected.
 */
export async function registerPosition(walletAddress, position) {
  try {
    const response = await fetch(`${API_URL}/api/monitor/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress, ...position }),
    });
    if (!response.ok) throw new Error(`Register position failed: ${response.status}`);
    return await response.json();
  } catch (err) {
    console.warn("[Monitor] Position registration error:", err.message);
    return null;
  }
}

/**
 * Fetch all active tracked positions for a wallet.
 */
export async function fetchPositions(walletAddress) {
  try {
    const response = await fetch(`${API_URL}/api/monitor/positions/${walletAddress}`);
    if (!response.ok) throw new Error(`Fetch positions failed: ${response.status}`);
    const data = await response.json();
    return data.positions || [];
  } catch (err) {
    console.warn("[Monitor] Fetch positions error:", err.message);
    return [];
  }
}

/**
 * Stop tracking a position (call when user exits a position).
 */
export async function closeTrackedPosition(walletAddress, positionId) {
  try {
    const response = await fetch(`${API_URL}/api/monitor/positions/${walletAddress}/${positionId}`, {
      method: "DELETE",
    });
    if (!response.ok) throw new Error(`Close position failed: ${response.status}`);
    return await response.json();
  } catch (err) {
    console.warn("[Monitor] Close position error:", err.message);
    return null;
  }
}

/**
 * Add listeners for incoming notifications
 */
export function addNotificationListeners(onReceive, onTap) {
  const receivedSubscription = Notifications.addNotificationReceivedListener(
    (notification) => {
      if (onReceive) onReceive(notification);
    }
  );

  const responseSubscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      if (onTap) onTap(response);
    }
  );

  return () => {
    receivedSubscription.remove();
    responseSubscription.remove();
  };
}
