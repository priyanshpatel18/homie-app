import React, { useCallback, useEffect, useRef, useState, Component } from "react";
import { StatusBar } from "expo-status-bar";
import { AppState, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { fontAssets } from "./src/theme/fonts";

SplashScreen.preventAutoHideAsync();
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { PrivyProvider, usePrivy, useEmbeddedSolanaWallet, getAccessToken } from "@privy-io/expo";
import { PrivyElements } from "@privy-io/expo/ui";
import * as SecureStore from "expo-secure-store";
import { IMPORTED_ADDR_STORE, walletImportSignal } from "./src/components/LoginSheet";
import PasscodeScreen from "./src/components/PasscodeScreen";
import { hasPasscode } from "./src/services/passcode";

// Suppress re-lock during voice input — speech recognition briefly backgrounds the app
import { lockSuppression } from "./src/state/lockSuppression";

import OnboardingScreen from "./src/screens/OnboardingScreen";
import HomeScreen from "./src/screens/HomeScreen";
import ChatScreen from "./src/screens/ChatScreen";
import AnimatedSplash from "./src/components/AnimatedSplash";
import {
  registerForPushNotifications,
  registerPushToken,
  addNotificationListeners,
} from "./src/services/notifications";
import { setAuthToken } from "./src/services/authStore";

const PRIVY_APP_ID = "cmnip9eo301x40cjofkev6bq1";

const Stack = createNativeStackNavigator();

// ─── Error boundary — prevents white screen crashes ──────────────────────────
class ErrorBoundary extends Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={eb.container}>
        <Text style={eb.title}>something went wrong</Text>
        <Text style={eb.sub}>
          {this.state.error?.message || "an unexpected error occurred"}
        </Text>
        <TouchableOpacity
          style={eb.btn}
          onPress={() => this.setState({ hasError: false, error: null })}
        >
          <Text style={eb.btnText}>try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const eb = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#010603", alignItems: "center", justifyContent: "center", padding: 32 },
  title:     { color: "#FFFFFF", fontSize: 18, fontWeight: "700", marginBottom: 10 },
  sub:       { color: "rgba(255,255,255,0.50)", fontSize: 14, lineHeight: 22, textAlign: "center", marginBottom: 28 },
  btn:       { backgroundColor: "rgba(74,222,128,0.15)", borderRadius: 14, paddingHorizontal: 28, paddingVertical: 13, borderWidth: 1, borderColor: "rgba(74,222,128,0.30)" },
  btnText:   { color: "#4ADE80", fontSize: 15, fontWeight: "700" },
});

function RootNavigator() {
  const privyState = usePrivy();
  const ready = privyState.isReady ?? privyState.ready;
  const authenticated = privyState.authenticated ?? !!privyState.user;
  const solanaWalletState = useEmbeddedSolanaWallet();
  const walletAddress = ready ? (solanaWalletState?.wallets?.[0]?.address ?? null) : null;
  const pushRegistered = useRef(false);

  // Keep the auth token fresh — refresh on login and on app foreground resume
  useEffect(() => {
    if (!authenticated) return;
    getAccessToken().then(setAuthToken).catch(() => {});
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated) return;
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        getAccessToken().then(setAuthToken).catch(() => {});
      }
    });
    return () => sub.remove();
  }, [authenticated]);

  const [importedAddress, setImportedAddress] = useState(null);
  const [importChecked, setImportChecked]     = useState(false);
  useEffect(() => {
    SecureStore.getItemAsync(IMPORTED_ADDR_STORE)
      .then((addr) => { setImportedAddress(addr || null); })
      .finally(() => setImportChecked(true));
    return walletImportSignal.subscribe((addr) => {
      setImportedAddress(addr);
      if (addr) {
        // New wallet created — show passcode setup
        setPasscodeState("setup");
      } else {
        // Logout — return to onboarding
        setPasscodeState("open");
      }
    });
  }, []);

  // ── Passcode state ───────────────────────────────────────────────────────────
  // "idle"   — not checked yet
  // "setup"  — user just authenticated, no passcode set → show setup
  // "locked" — passcode exists, need verification
  // "open"   — unlocked
  const [passcodeState, setPasscodeState] = useState("idle");
  const prevAuthRef = useRef(false);

  // Check passcode state on startup when session already exists
  useEffect(() => {
    if (!ready || !importChecked) return;
    const hasSession = authenticated || !!importedAddress;
    if (!hasSession) { setPasscodeState("open"); return; }

    hasPasscode()
      .then((exists) => {
        setPasscodeState(exists ? "locked" : "open");
      })
      .catch(() => setPasscodeState("open"));
  }, [ready, importChecked]);

  // Detect new login via Privy OAuth (authenticated just became true)
  useEffect(() => {
    if (!ready) return;
    const justLoggedIn = authenticated && !prevAuthRef.current;
    prevAuthRef.current = authenticated;
    if (!justLoggedIn) return;

    hasPasscode()
      .then((exists) => {
        setPasscodeState(exists ? "locked" : "open");
      })
      .catch(() => setPasscodeState("open"));
  }, [authenticated, ready]);

  // Re-lock when app comes to foreground — only if a passcode is actually set
  // Skips re-lock when voice input is active (speech recognition briefly backgrounds the app)
  const appStateRef = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      const wasBackground = appStateRef.current.match(/inactive|background/);
      const nowActive     = next === "active";
      if (wasBackground && nowActive && (authenticated || importedAddress)) {
        if (lockSuppression.active) {
          // Voice input caused the background transition — don't re-lock
          lockSuppression.active = false;
        } else {
          hasPasscode()
            .then((exists) => { if (exists) setPasscodeState("locked"); })
            .catch(() => {});
        }
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [authenticated, importedAddress]);

  // Push notifications
  useEffect(() => {
    if (!authenticated || !walletAddress || pushRegistered.current) return;
    async function setupPush() {
      try {
        const token = await registerForPushNotifications();
        if (token) {
          await registerPushToken(walletAddress, token);
          pushRegistered.current = true;
        }
      } catch {}
    }
    setupPush();
  }, [authenticated, walletAddress]);

  useEffect(() => {
    return addNotificationListeners(
      (n)  => console.log("[Push] Received:", n.request.content.title),
      (r)  => console.log("[Push] Tapped:",  r.notification.request.content.data),
    );
  }, []);

  if (!ready || !importChecked || passcodeState === "idle") {
    return <View style={{ flex: 1, backgroundColor: "#010603" }} />;
  }

  const hasSession = authenticated || !!importedAddress;
  // During passcode setup, keep onboarding in background so chat loads fresh after confirm
  const showChat = hasSession && passcodeState !== "setup";

  return (
    <>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {showChat ? (
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Chat" component={ChatScreen} />
          </>
        ) : (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        )}
      </Stack.Navigator>

      {/* Setup passcode — onboarding visible behind, chat loads after confirm */}
      {hasSession && passcodeState === "setup" && (
        <PasscodeScreen
          mode="setup"
          onSuccess={() => setPasscodeState("open")}
        />
      )}

      {/* Verify passcode — chat visible behind while locked */}
      {hasSession && passcodeState === "locked" && (
        <PasscodeScreen
          mode="verify"
          onSuccess={() => setPasscodeState("open")}
        />
      )}
    </>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts(fontAssets);
  const [splashDone, setSplashDone] = useState(false);

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) await SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <PrivyProvider
        appId={PRIVY_APP_ID}
        clientId="client-WY6XnEhNKAXe3vbrLMyaXavgTmupwidjqNNxbe7Da8j9J"
        config={{
          embeddedWallets: {
            createOnLogin: "users-without-wallets",
          },
        }}
      >
        <SafeAreaProvider onLayout={onLayoutRootView}>
          <NavigationContainer>
            <StatusBar style="light" />
            <RootNavigator />
          </NavigationContainer>
          <PrivyElements />
          {!splashDone && (
            <AnimatedSplash onDone={() => setSplashDone(true)} />
          )}
        </SafeAreaProvider>
      </PrivyProvider>
    </ErrorBoundary>
  );
}
