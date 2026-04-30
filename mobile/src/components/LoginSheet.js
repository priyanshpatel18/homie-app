/**
 * LoginSheet — custom authentication bottom sheet.
 *
 * Replaces Privy's built-in modal with a themed sheet matching the app's
 * dark glassmorphic design. Supports:
 *   1. Google OAuth (useLoginWithOAuth)
 *   2. Apple OAuth  (useLoginWithOAuth)
 *   3. Email OTP   (useLoginWithEmail → sendCode → loginWithCode)
 *   4. Import private key (bs58 / byte-array → SecureStore)
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Animated,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Dimensions,
  Pressable,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as SecureStore from "expo-secure-store";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { Buffer } from "buffer";
import {
  Mail,
  Key,
  X,
  ChevronLeft,
  Eye,
  EyeOff,
  ClipboardPaste,
  ShieldCheck,
  Chrome,
  Smartphone,
} from "lucide-react-native";
import { useLoginWithOAuth, useLoginWithEmail } from "@privy-io/expo";
import GradientButton from "./GradientButton";

// ─── SecureStore keys ────────────────────────────────────────────────────────
export const IMPORTED_KEY_STORE  = "imported_wallet_key";
export const IMPORTED_ADDR_STORE = "imported_wallet_address";

// ─── Import signal ─────────────────────────────────────────────────────────
// Lets App.js react immediately when a key is imported without polling SecureStore.
let _importListeners = [];
export const walletImportSignal = {
  emit: (address) => _importListeners.forEach((fn) => fn(address)),
  subscribe: (fn) => {
    _importListeners.push(fn);
    return () => { _importListeners = _importListeners.filter((l) => l !== fn); };
  },
};

// ─── Palette (matches app theme) ─────────────────────────────────────────────
const GREEN       = "#4ADE80";
const GREEN_DIM   = "rgba(74,222,128,0.12)";
const GREEN_GLOW  = "rgba(74,222,128,0.18)";
const GLASS       = "rgba(255,255,255,0.06)";
const GLASS_MED   = "rgba(255,255,255,0.09)";
const GLASS_HEAVY = "rgba(255,255,255,0.14)";
const BORDER      = "rgba(255,255,255,0.10)";
const BORDER_LT   = "rgba(255,255,255,0.16)";
const TEXT_PRI    = "#FFFFFF";
const TEXT_SEC    = "rgba(255,255,255,0.58)";
const TEXT_MUTED  = "rgba(255,255,255,0.28)";
const DANGER      = "rgba(248,113,113,0.85)";
const SHEET_BG    = "rgba(7,9,8,0.97)";

const { height: SCREEN_H } = Dimensions.get("window");
const SHEET_HEIGHT = Math.min(SCREEN_H * 0.68, 520);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function decodePrivateKey(input) {
  const trimmed = input.trim();

  // Format 1: JSON byte array  [1, 2, ..., 64]
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr) && arr.length === 64) {
        return new Uint8Array(arr);
      }
    } catch { /* fall through */ }
  }

  // Format 2: base58 string (Phantom / Solflare export)
  try {
    const decoded = bs58.decode(trimmed);
    if (decoded.length === 64) return decoded;
  } catch { /* fall through */ }

  // Format 3: hex string (64 bytes = 128 hex chars)
  if (/^[0-9a-fA-F]{128}$/.test(trimmed)) {
    const arr = new Uint8Array(64);
    for (let i = 0; i < 64; i++) {
      arr[i] = parseInt(trimmed.slice(i * 2, i * 2 + 2), 16);
    }
    return arr;
  }

  return null;
}

// ─── Option row ───────────────────────────────────────────────────────────────

function OptionRow({ icon, label, sublabel, onPress, loading, accent, style }) {
  return (
    <TouchableOpacity
      style={[s.optionRow, accent && s.optionRowAccent, style]}
      onPress={onPress}
      activeOpacity={0.75}
      disabled={loading}
    >
      <View style={[s.optionIcon, accent && s.optionIconAccent]}>
        {loading
          ? <ActivityIndicator size={16} color={accent ? "#000" : GREEN} />
          : icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.optionLabel, accent && s.optionLabelAccent]}>{label}</Text>
        {sublabel && <Text style={s.optionSub}>{sublabel}</Text>}
      </View>
    </TouchableOpacity>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LoginSheet({ visible, onClose, onImportSuccess }) {
  // "main" | "email" | "otp" | "import"
  const [view, setView]           = useState("main");
  const [email, setEmail]         = useState("");
  const [code, setCode]           = useState("");
  const [privKey, setPrivKey]     = useState("");
  const [showKey, setShowKey]     = useState(false);
  const [keyError, setKeyError]   = useState("");
  const [emailError, setEmailError] = useState("");
  const [codeError, setCodeError] = useState("");
  const [importing, setImporting] = useState(false);

  // Animation
  const slideY  = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setView("main");
      setEmail(""); setCode(""); setPrivKey("");
      setKeyError(""); setEmailError(""); setCodeError("");
      Animated.parallel([
        Animated.spring(slideY,  { toValue: 0,   useNativeDriver: true, tension: 80, friction: 12 }),
        Animated.timing(backdrop, { toValue: 1,   useNativeDriver: true, duration: 250 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideY,   { toValue: SHEET_HEIGHT, useNativeDriver: true, duration: 220 }),
        Animated.timing(backdrop, { toValue: 0,             useNativeDriver: true, duration: 200 }),
      ]).start();
    }
  }, [visible]);

  // ── Privy hooks ──────────────────────────────────────────────────────────────
  const { login: oauthLogin, state: oauthState } = useLoginWithOAuth({
    onSuccess: () => onClose(),
    onError: (err) => console.error("[OAuth]", err?.message),
  });

  const { sendCode, loginWithCode, state: emailState } = useLoginWithEmail({
    onComplete: () => onClose(),
  });

  const oauthLoading = oauthState?.status === "loading";

  // ── OAuth handlers ────────────────────────────────────────────────────────────
  async function handleGoogle() {
    try { await oauthLogin({ provider: "google" }); }
    catch (e) { console.error("[Google]", e.message); }
  }

  async function handleApple() {
    try { await oauthLogin({ provider: "apple" }); }
    catch (e) { console.error("[Apple]", e.message); }
  }

  // ── Email OTP handlers ────────────────────────────────────────────────────────
  async function handleSendCode() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError("Enter a valid email address.");
      return;
    }
    setEmailError("");
    try {
      await sendCode({ email: trimmed });
      setView("otp");
    } catch (e) {
      setEmailError(e?.message || "Failed to send code. Try again.");
    }
  }

  async function handleVerifyCode() {
    const trimmed = code.trim();
    if (trimmed.length !== 6) {
      setCodeError("Enter the 6-digit code from your email.");
      return;
    }
    setCodeError("");
    try {
      await loginWithCode({ code: trimmed, email: email.trim().toLowerCase() });
    } catch (e) {
      setCodeError(e?.message || "Invalid code. Try again.");
    }
  }

  // ── Import private key handler ────────────────────────────────────────────────
  async function handleImport() {
    if (!privKey.trim()) {
      setKeyError("Paste your private key above.");
      return;
    }
    setKeyError("");
    setImporting(true);
    try {
      const keyBytes = decodePrivateKey(privKey);
      if (!keyBytes) {
        setKeyError("Invalid key. Use base58, hex, or byte-array format.");
        return;
      }
      const keypair = Keypair.fromSecretKey(keyBytes);
      const address = keypair.publicKey.toBase58();

      // Store key bytes as base64 and the derived address
      await SecureStore.setItemAsync(IMPORTED_KEY_STORE,  Buffer.from(keyBytes).toString("base64"));
      await SecureStore.setItemAsync(IMPORTED_ADDR_STORE, address);

      setPrivKey("");
      walletImportSignal.emit(address);  // triggers App.js routing update
      onClose();
      onImportSuccess?.(address);
    } catch (e) {
      setKeyError("Failed to decode key: " + (e?.message || "unknown error"));
    } finally {
      setImporting(false);
    }
  }

  async function handlePaste() {
    try {
      const text = await Clipboard.getStringAsync();
      if (text) { setPrivKey(text); setKeyError(""); }
    } catch { /* ignore */ }
  }

  // ── Back navigation ───────────────────────────────────────────────────────────
  function goBack() {
    if (view === "otp") { setView("email"); setCode(""); setCodeError(""); }
    else { setView("main"); }
  }

  // ── Render helpers ────────────────────────────────────────────────────────────
  function renderHeader(title, showBack = false) {
    return (
      <View style={s.header}>
        {showBack
          ? <TouchableOpacity style={s.headerBtn} onPress={goBack}>
              <ChevronLeft size={20} color={TEXT_SEC} />
            </TouchableOpacity>
          : <View style={s.headerBtn} />}
        <Text style={s.headerTitle}>{title}</Text>
        <TouchableOpacity style={s.headerBtn} onPress={onClose}>
          <X size={18} color={TEXT_SEC} />
        </TouchableOpacity>
      </View>
    );
  }

  function renderMain() {
    return (
      <View style={s.viewBody}>
        {renderHeader("Connect Wallet")}

        <View style={s.optionGroup}>
          <OptionRow
            icon={<Chrome size={19} color="#FFFFFF" strokeWidth={1.8} />}
            label="Continue with Google"
            loading={oauthLoading}
            onPress={handleGoogle}
          />
          <View style={s.dividerLine} />
          <OptionRow
            icon={<Smartphone size={19} color="#FFFFFF" strokeWidth={1.8} />}
            label="Continue with Apple"
            loading={oauthLoading}
            onPress={handleApple}
          />
          <View style={s.dividerLine} />
          <OptionRow
            icon={<Mail size={18} color={TEXT_SEC} />}
            label="Continue with Email"
            onPress={() => setView("email")}
          />
        </View>

        <View style={s.orRow}>
          <View style={s.orLine} />
          <Text style={s.orText}>or</Text>
          <View style={s.orLine} />
        </View>

        <View style={s.optionGroup}>
          <OptionRow
            icon={<Key size={18} color={GREEN} />}
            label="Import Private Key"
            sublabel="Use your existing Solana wallet"
            onPress={() => setView("import")}
          />
        </View>
      </View>
    );
  }

  function renderEmail() {
    const sending = emailState?.status === "sending-code";
    return (
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={s.viewBody}>
          {renderHeader("Enter Email", true)}

          <Text style={s.fieldLabel}>Email address</Text>
          <View style={[s.inputBox, emailError && s.inputBoxError]}>
            <TextInput
              style={s.textInput}
              value={email}
              onChangeText={(t) => { setEmail(t); setEmailError(""); }}
              placeholder="you@example.com"
              placeholderTextColor={TEXT_MUTED}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              autoFocus
            />
          </View>
          {emailError ? <Text style={s.errorText}>{emailError}</Text> : null}

          <GradientButton
            onPress={handleSendCode}
            disabled={sending}
            style={s.cta}
            paddingVertical={17}
          >
            {sending
              ? <ActivityIndicator size={18} color="#000" />
              : <Text style={s.ctaText}>Send Code</Text>}
          </GradientButton>
        </View>
      </KeyboardAvoidingView>
    );
  }

  function renderOtp() {
    const verifying = emailState?.status === "submitting-code";
    return (
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={s.viewBody}>
          {renderHeader("Enter Code", true)}

          <Text style={s.fieldLabel}>6-digit verification code</Text>
          <Text style={s.fieldHint}>Sent to {email}</Text>
          <View style={[s.inputBox, s.inputBoxCode, codeError && s.inputBoxError]}>
            <TextInput
              style={[s.textInput, s.codeInput]}
              value={code}
              onChangeText={(t) => { setCode(t.replace(/\D/g, "").slice(0, 6)); setCodeError(""); }}
              placeholder="000000"
              placeholderTextColor={TEXT_MUTED}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />
          </View>
          {codeError ? <Text style={s.errorText}>{codeError}</Text> : null}

          <GradientButton
            onPress={handleVerifyCode}
            disabled={verifying}
            style={s.cta}
            paddingVertical={17}
          >
            {verifying
              ? <ActivityIndicator size={18} color="#000" />
              : <Text style={s.ctaText}>Verify & Sign In</Text>}
          </GradientButton>

          <TouchableOpacity style={s.resendBtn} onPress={() => setView("email")}>
            <Text style={s.resendText}>Resend code</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  function renderImport() {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={s.viewBody}>
          {renderHeader("Import Private Key", true)}

          <Text style={s.fieldLabel}>Private key</Text>
          <Text style={s.fieldHint}>Paste your base58, hex, or byte-array key.</Text>

          <View style={[s.inputBox, s.inputBoxKey, keyError && s.inputBoxError]}>
            <TextInput
              style={[s.textInput, s.keyInput]}
              value={privKey}
              onChangeText={(t) => { setPrivKey(t); setKeyError(""); }}
              placeholder="Enter or paste private key..."
              placeholderTextColor={TEXT_MUTED}
              secureTextEntry={!showKey}
              multiline={showKey}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={s.keyActions}>
              <TouchableOpacity style={s.keyActionBtn} onPress={handlePaste}>
                <ClipboardPaste size={16} color={TEXT_SEC} />
              </TouchableOpacity>
              <TouchableOpacity style={s.keyActionBtn} onPress={() => setShowKey((v) => !v)}>
                {showKey
                  ? <EyeOff size={16} color={TEXT_SEC} />
                  : <Eye size={16} color={TEXT_SEC} />}
              </TouchableOpacity>
            </View>
          </View>
          {keyError ? <Text style={s.errorText}>{keyError}</Text> : null}

          <GradientButton
            onPress={handleImport}
            disabled={importing}
            style={s.cta}
            paddingVertical={17}
          >
            {importing
              ? <ActivityIndicator size={18} color="#000" />
              : <Text style={s.ctaText}>Import Wallet</Text>}
          </GradientButton>

          {/* Security notice */}
          <View style={s.securityNote}>
            <ShieldCheck size={14} color={GREEN} />
            <Text style={s.securityText}>
              Your key is encrypted on-device and never transmitted.
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent>
      {/* Backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, s.backdrop, { opacity: backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View style={[s.sheet, { transform: [{ translateY: slideY }] }]}>
        {/* Drag handle */}
        <View style={s.handle} />

        {/* Green accent glow at top */}
        <View style={s.sheetGlow} pointerEvents="none" />

        {view === "main"   && renderMain()}
        {view === "email"  && renderEmail()}
        {view === "otp"    && renderOtp()}
        {view === "import" && renderImport()}
      </Animated.View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(0,0,0,0.60)",
    justifyContent: "flex-end",
  },

  sheet: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    height: SHEET_HEIGHT,
    backgroundColor: SHEET_BG,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: BORDER_LT,
    overflow: "hidden",
  },

  sheetGlow: {
    position: "absolute",
    top: -60, left: "15%", right: "15%",
    height: 120,
    borderRadius: 60,
    backgroundColor: GREEN_GLOW,
    // Blur not available natively — green tint gives the atmosphere
  },

  handle: {
    width: 40, height: 4,
    backgroundColor: BORDER_LT,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12, marginBottom: 4,
  },

  viewBody: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 32,
  },

  // ── Header ──
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
  },
  headerBtn: {
    width: 36, height: 36,
    alignItems: "center", justifyContent: "center",
    backgroundColor: GLASS,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  headerTitle: {
    color: TEXT_PRI,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.2,
  },

  // ── Option rows ──
  optionGroup: {
    backgroundColor: GLASS,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
  },

  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 15,
    gap: 14,
  },
  optionRowAccent: {
    backgroundColor: GREEN,
    borderRadius: 14,
  },

  optionIcon: {
    width: 36, height: 36,
    backgroundColor: GLASS_MED,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  optionIconAccent: {
    backgroundColor: "rgba(0,0,0,0.18)",
    borderColor: "rgba(0,0,0,0.08)",
  },

  optionLabel: {
    color: TEXT_PRI,
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  optionLabelAccent: { color: "#000" },

  optionSub: {
    color: TEXT_MUTED,
    fontSize: 12,
    marginTop: 2,
  },

  dividerLine: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: BORDER,
    marginLeft: 66,
  },


  // ── Or divider ──
  orRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 16,
    gap: 10,
  },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: BORDER },
  orText: { color: TEXT_MUTED, fontSize: 12, fontWeight: "600", letterSpacing: 1 },

  // ── Fields ──
  fieldLabel: {
    color: TEXT_SEC,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginTop: 4,
    marginBottom: 8,
  },
  fieldHint: {
    color: TEXT_MUTED,
    fontSize: 12,
    marginBottom: 10,
    marginTop: -4,
  },

  inputBox: {
    backgroundColor: GLASS,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  inputBoxError: {
    borderColor: "rgba(248,113,113,0.45)",
  },
  inputBoxCode: {
    justifyContent: "center",
  },
  inputBoxKey: {
    alignItems: "flex-start",
    paddingTop: 12,
    paddingBottom: 10,
    minHeight: 80,
  },

  textInput: {
    flex: 1,
    color: TEXT_PRI,
    fontSize: 15,
    paddingVertical: 14,
  },
  codeInput: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 10,
    textAlign: "center",
  },
  keyInput: {
    fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    paddingVertical: 0,
    flex: 1,
  },

  keyActions: {
    flexDirection: "column",
    gap: 8,
    paddingLeft: 8,
    paddingBottom: 2,
  },
  keyActionBtn: {
    width: 30, height: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GLASS_MED,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
  },

  errorText: {
    color: DANGER,
    fontSize: 12,
    marginBottom: 10,
    marginTop: 2,
  },

  cta: { marginTop: 8, marginBottom: 12 },
  ctaText: { color: "#000", fontSize: 16, fontWeight: "800", letterSpacing: 0.2 },

  resendBtn: { alignItems: "center", paddingVertical: 6 },
  resendText: { color: GREEN, fontSize: 14, fontWeight: "600" },

  // ── Security note ──
  securityNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: GREEN_DIM,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.18)",
  },
  securityText: {
    color: TEXT_SEC,
    fontSize: 12,
    lineHeight: 17,
    flex: 1,
  },
});
