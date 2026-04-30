import { useRef, useEffect, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, Easing, Dimensions, Image, ActivityIndicator,
} from "react-native";
import Svg, { Path, G } from "react-native-svg";
import { F } from "../theme/fonts";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { usePrivy } from "@privy-io/expo";
import { useLoginWithOAuth } from "@privy-io/expo";
import * as SecureStore from "expo-secure-store";
import { Keypair } from "@solana/web3.js";
import { Buffer } from "buffer";
import HomieLogoMain from "../components/HomieLogoMain";
import SkiaGlowBackground from "../components/SkiaGlowBackground";
import GradientButton from "../components/GradientButton";
import WalletOptionsSheet from "../components/WalletOptionsSheet";
import SocialOtherSheet from "../components/SocialOtherSheet";
import { IMPORTED_KEY_STORE, IMPORTED_ADDR_STORE, walletImportSignal } from "../components/LoginSheet";

const { width: W } = Dimensions.get("window");
const BG = "#010603";

function GoogleIcon({ size = 18 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <Path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <Path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <Path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </Svg>
  );
}

function AppleIcon({ size = 18, color = "#FFFFFF" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path fill={color} d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </Svg>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function OnboardingScreen() {
  const { isReady } = usePrivy();
  const [walletSheet, setWalletSheet]   = useState(false);
  const [otherSheet, setOtherSheet]     = useState(false);
  const [creating, setCreating]         = useState(false);

  const bottomY = useRef(new Animated.Value(40)).current;
  const bottomO = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(bottomY, { toValue: 0, duration: 600, delay: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(bottomO, { toValue: 1, duration: 600, delay: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  // ── Privy OAuth for Google / Apple ───────────────────────────────────────────
  const { login: oauthLogin, state: oauthState } = useLoginWithOAuth({
    onSuccess: () => {},
    onError: (err) => console.error("[OAuth]", err?.message),
  });
  const oauthLoading = oauthState?.status === "loading";

  async function handleGoogle() {
    try { await oauthLogin({ provider: "google" }); } catch {}
  }

  async function handleApple() {
    try { await oauthLogin({ provider: "apple" }); } catch {}
  }

  // ── Auto-generate wallet — no social login needed ────────────────────────────
  async function handleCreateWallet() {
    if (!isReady || creating) return;
    setCreating(true);
    try {
      const keypair = Keypair.generate();
      const address = keypair.publicKey.toBase58();
      await SecureStore.setItemAsync(IMPORTED_KEY_STORE,  Buffer.from(keypair.secretKey).toString("base64"));
      await SecureStore.setItemAsync(IMPORTED_ADDR_STORE, address);
      walletImportSignal.emit(address);
      // PasscodeScreen (setup mode) appears automatically via App.js state machine
    } catch (e) {
      console.error("[CreateWallet]", e.message);
      setCreating(false);
    }
  }

  const disabled = !isReady;

  return (
    <View style={s.root}>
      <SkiaGlowBackground />

      {/* ── Hero image — bleeds behind status bar ── */}
      <Image
        source={require("../../assets/onboardingbg.png")}
        style={s.heroImage}
        resizeMode="cover"
      />
      <LinearGradient
        colors={["transparent", BG]}
        style={s.heroFade}
        pointerEvents="none"
      />

      <SafeAreaView style={s.safe} edges={["bottom"]}>

        <View style={s.heroSpacer} />

        <Animated.View style={[s.bottom, { opacity: bottomO, transform: [{ translateY: bottomY }] }]}>

          {/* Headline */}
          <View style={s.headlineRow}>
            <Text style={s.headline}>Meet </Text>
            <View style={s.inlineLogo}><HomieLogoMain size={32} /></View>
            <Text style={s.headline}> Homie.</Text>
          </View>

          <Text style={s.sub}>
            Your Solana co-pilot. Create a wallet in seconds — no seed phrase, no complexity.
          </Text>

          {/* ── Create Wallet (auto-generate) ── */}
          <GradientButton
            onPress={handleCreateWallet}
            disabled={disabled || creating}
            style={s.primaryBtn}
            paddingVertical={18}
          >
            {creating
              ? <ActivityIndicator size={18} color="#000" />
              : <Text style={s.primaryBtnText}>Create Wallet</Text>}
          </GradientButton>

          {/* ── I already have a wallet ── */}
          <TouchableOpacity
            style={s.secondaryBtn}
            onPress={() => setWalletSheet(true)}
            disabled={disabled}
            activeOpacity={0.7}
          >
            <Text style={s.secondaryBtnText}>I already have a wallet</Text>
          </TouchableOpacity>

          {/* ── Divider ── */}
          <View style={s.orRow}>
            <View style={s.orLine} />
            <Text style={s.orText}>or</Text>
            <View style={s.orLine} />
          </View>

          {/* ── Google + Apple side by side ── */}
          <View style={s.socialRow}>
            <TouchableOpacity
              style={s.socialBtn}
              onPress={handleGoogle}
              disabled={disabled || oauthLoading}
              activeOpacity={0.75}
            >
              {oauthLoading
                ? <ActivityIndicator size={16} color="rgba(255,255,255,0.6)" />
                : <GoogleIcon size={18} />}
              <Text style={s.socialBtnText}>Google</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.socialBtn}
              onPress={handleApple}
              disabled={disabled || oauthLoading}
              activeOpacity={0.75}
            >
              <AppleIcon size={18} color="#FFFFFF" />
              <Text style={s.socialBtnText}>Apple</Text>
            </TouchableOpacity>
          </View>

          {/* ── Other social logins link ── */}
          <TouchableOpacity
            style={s.otherLink}
            onPress={() => setOtherSheet(true)}
            disabled={disabled}
            activeOpacity={0.7}
          >
            <Text style={s.otherLinkText}>Other social login methods</Text>
          </TouchableOpacity>

          <Text style={s.legal}>
            By continuing you accept our{" "}
            <Text style={s.legalLink}>Terms of Use & Privacy Policy</Text>
          </Text>

        </Animated.View>
      </SafeAreaView>

      <WalletOptionsSheet
        visible={walletSheet}
        onClose={() => setWalletSheet(false)}
        onImportSuccess={() => setWalletSheet(false)}
      />

      <SocialOtherSheet
        visible={otherSheet}
        onClose={() => setOtherSheet(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  safe: { flex: 1 },

  heroImage: {
    position: "absolute", top: 0, left: 0, right: 0,
    height: "63%", width: W, opacity: 0.55,
  },
  heroFade: {
    position: "absolute", top: "33%", left: 0, right: 0, height: "30%",
  },
  heroSpacer: { flex: 1 },

  bottom: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },

  headlineRow: {
    flexDirection: "row", alignItems: "center",
    marginBottom: 10, flexWrap: "wrap",
  },
  headline: {
    color: "#FFFFFF", fontSize: 34, fontFamily: F.headBold,
    letterSpacing: -0.6, lineHeight: 42,
  },
  inlineLogo: {
    width: 38, height: 38,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(74,222,128,0.12)", borderRadius: 10,
    borderWidth: 1, borderColor: "rgba(74,222,128,0.20)", marginTop: -2,
  },

  sub: {
    color: "rgba(255,255,255,0.48)", fontSize: 13, lineHeight: 20, marginBottom: 20,
    fontFamily: F.regular,
  },

  // ── Social row ──
  socialRow: {
    flexDirection: "row", gap: 10, marginBottom: 12,
  },
  socialBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
  },
  socialBtnText: { color: "#fff", fontSize: 14, fontFamily: F.semibold },

  // ── Other link ──
  otherLink: { alignItems: "center", paddingVertical: 8, marginBottom: 4 },
  otherLinkText: { color: "rgba(255,255,255,0.38)", fontSize: 13, fontFamily: F.medium },

  // ── Or divider ──
  orRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.10)" },
  orText: { color: "rgba(255,255,255,0.25)", fontSize: 11, fontFamily: F.semibold, letterSpacing: 1 },

  primaryBtn: { marginBottom: 10 },
  primaryBtnText: { color: "#000", fontSize: 16, fontFamily: F.headBold, letterSpacing: 0.2 },

  secondaryBtn: {
    borderRadius: 18, paddingVertical: 16, alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
    marginBottom: 18,
  },
  secondaryBtnText: { color: "rgba(255,255,255,0.60)", fontSize: 15, fontFamily: F.semibold },

  legal: { color: "rgba(255,255,255,0.22)", fontSize: 11, textAlign: "center", lineHeight: 17, fontFamily: F.regular },
  legalLink: { color: "rgba(255,255,255,0.40)", fontFamily: F.bold },
});
