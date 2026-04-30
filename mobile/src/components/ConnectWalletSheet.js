/**
 * ConnectWalletSheet — "I already have a wallet" flow.
 *
 * Options:
 *   1. Phantom deep-link connection
 *   2. Solflare deep-link connection
 *   3. Backpack deep-link connection
 *   4. Import private key (always works as fallback)
 */

import { useState, useRef, useEffect } from "react";
import {
  View, Text, Modal, TouchableOpacity, StyleSheet,
  Animated, Platform, Linking, Dimensions, Pressable,
  ActivityIndicator, TextInput,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as SecureStore from "expo-secure-store";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { Buffer } from "buffer";
import { ChevronLeft, X, Key, Eye, EyeOff, ClipboardPaste, ShieldCheck, HelpCircle } from "lucide-react-native";
import Svg, { Path, Defs, LinearGradient, Stop } from "react-native-svg";
import { IMPORTED_KEY_STORE, IMPORTED_ADDR_STORE, walletImportSignal } from "./LoginSheet";
import GradientButton from "./GradientButton";

const GREEN      = "#4ADE80";
const GREEN_DIM  = "rgba(74,222,128,0.12)";
const GREEN_GLOW = "rgba(74,222,128,0.18)";
const GLASS      = "rgba(255,255,255,0.06)";
const GLASS_MED  = "rgba(255,255,255,0.09)";
const BORDER     = "rgba(255,255,255,0.10)";
const BORDER_LT  = "rgba(255,255,255,0.16)";
const TEXT_PRI   = "#FFFFFF";
const TEXT_SEC   = "rgba(255,255,255,0.58)";
const TEXT_MUTED = "rgba(255,255,255,0.28)";
const DANGER     = "rgba(248,113,113,0.85)";
const SHEET_BG   = "rgba(7,9,8,0.97)";

const { height: SCREEN_H } = Dimensions.get("window");
const SHEET_H = Math.min(SCREEN_H * 0.72, 560);

// ─── Brand SVG Icons ─────────────────────────────────────────────────────────
function PhantomIcon({ size = 22 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Defs>
        <LinearGradient id="grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#00F666" />
          <Stop offset="1" stopColor="#B9FFCE" />
        </LinearGradient>
      </Defs>
      <Path fill="url(#grad)" d="M5.13 19.2c2.297 0 4.023-1.92 5.053-3.436a2.9 2.9 0 0 0-.195.994c0 .885.53 1.516 1.574 1.516 1.433 0 2.965-1.208 3.758-2.51a2 2 0 0 0-.083.524c0 .617.362 1.006 1.1 1.006 2.324 0 4.663-3.959 4.663-7.421C21 7.175 19.58 4.8 16.016 4.8 9.752 4.8 3 12.154 3 16.905 3 18.771 4.044 19.2 5.13 19.2m8.729-9.622c0-.671.39-1.141.96-1.141.557 0 .947.47.947 1.14 0 .672-.39 1.155-.947 1.155-.57 0-.96-.483-.96-1.154m2.979 0c0-.671.39-1.141.96-1.141.557 0 .947.47.947 1.14 0 .672-.39 1.155-.947 1.155-.57 0-.96-.483-.96-1.154" />
    </Svg>
  );
}

function SolflareIcon({ size = 22 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Defs>
        <LinearGradient id="grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#00F666" />
          <Stop offset="1" stopColor="#B9FFCE" />
        </LinearGradient>
      </Defs>
      <Path fill="url(#grad)" d="m12.063 12.715 1.245-1.199 2.32.757c1.518.505 2.278 1.43 2.278 2.734 0 .988-.38 1.64-1.14 2.481l-.231.253.084-.59c.337-2.144-.295-3.07-2.383-3.742zM8.942 5.376l6.327 2.103-1.37 1.304-3.291-1.094c-1.139-.378-1.519-.988-1.666-2.27zm-.38 10.682 1.434-1.367 2.7.884c1.413.462 1.898 1.072 1.75 2.607zM6.748 9.96c0-.4.211-.778.57-1.093.38.547 1.033 1.03 2.067 1.367l2.235.736-1.244 1.198-2.194-.715c-1.012-.336-1.434-.84-1.434-1.493M13.371 21c4.64-3.07 7.129-5.152 7.129-7.717 0-1.704-1.012-2.65-3.248-3.386l-1.687-.568 4.619-4.415-.928-.989-1.371 1.199L11.409 3c-2.003.652-4.534 2.565-4.534 4.479 0 .21.02.42.084.652-1.666.946-2.341 1.83-2.341 2.923 0 1.03.548 2.06 2.299 2.628l1.392.463L3.5 18.75l.928.988 1.498-1.366z" />
    </Svg>
  );
}

function BackpackIcon({ size = 22 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Defs>
        <LinearGradient id="grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#00F666" />
          <Stop offset="1" stopColor="#B9FFCE" />
        </LinearGradient>
      </Defs>
      <Path fill="url(#grad)" fillRule="evenodd" d="M13.194 4.415c.666 0 1.29.088 1.87.25C14.496 3.37 13.32 3 12.011 3c-1.312 0-2.49.37-3.055 1.673a6.6 6.6 0 0 1 1.86-.258zm-2.529 1.302c-3.163 0-4.965 2.444-4.965 5.459v3.097c0 .301.256.54.573.54h11.454c.317 0 .573-.239.573-.54v-3.097c0-3.015-2.096-5.459-5.259-5.459zm1.33 5.486c1.108 0 2.005-.882 2.005-1.97 0-1.087-.897-1.968-2.005-1.968-1.106 0-2.004.881-2.004 1.969 0 1.087.898 1.969 2.005 1.969M5.7 16.633a.56.56 0 0 1 .573-.546h11.454a.56.56 0 0 1 .573.546v3.275c0 .603-.513 1.092-1.145 1.092H6.845c-.632 0-1.145-.489-1.145-1.092z" clipRule="evenodd" />
    </Svg>
  );
}

// ─── Wallet configs ───────────────────────────────────────────────────────────
const WALLETS = [
  {
    id: "phantom",
    name: "Phantom",
    color: "#AB9FF2",
    Icon: PhantomIcon,
    deepLink: "https://phantom.app/ul/v1/connect",
    storeAndroid: "https://play.google.com/store/apps/details?id=app.phantom",
    storeIos: "https://apps.apple.com/app/phantom-solana-wallet/id1598432977",
    scheme: "phantom://",
  },
  {
    id: "solflare",
    name: "Solflare",
    color: "#FC8C00",
    Icon: SolflareIcon,
    deepLink: "https://solflare.com/ul/v1/connect",
    storeAndroid: "https://play.google.com/store/apps/details?id=com.solflare.mobile",
    storeIos: "https://apps.apple.com/app/solflare-solana-wallet/id1580902717",
    scheme: "solflare://",
  },
  {
    id: "backpack",
    name: "Backpack",
    color: "#E33E3F",
    Icon: BackpackIcon,
    deepLink: "https://backpack.app",
    storeAndroid: "https://play.google.com/store/apps/details?id=app.backpack",
    storeIos: "https://apps.apple.com/app/backpack-crypto-wallet/id6445964121",
    scheme: "backpack://",
  },
];

// ─── Private key decoder (same as LoginSheet) ─────────────────────────────────
function decodePrivateKey(input) {
  const trimmed = input.trim();
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr) && arr.length === 64) return new Uint8Array(arr);
    } catch {}
  }
  try {
    const decoded = bs58.decode(trimmed);
    if (decoded.length === 64) return decoded;
  } catch {}
  if (/^[0-9a-fA-F]{128}$/.test(trimmed)) {
    const arr = new Uint8Array(64);
    for (let i = 0; i < 64; i++) arr[i] = parseInt(trimmed.slice(i * 2, i * 2 + 2), 16);
    return arr;
  }
  return null;
}

// ─── Wallet row ───────────────────────────────────────────────────────────────
function WalletRow({ wallet, onPress, isLast }) {
  const WalletIcon = wallet.Icon;
  return (
    <TouchableOpacity
      style={[s.walletRow, !isLast && s.walletRowDivider]}
      onPress={() => onPress(wallet)}
      activeOpacity={0.7}
    >
      <View style={[s.walletIcon, { backgroundColor: GREEN_DIM, borderColor: "rgba(74,222,128,0.15)" }]}>
        <WalletIcon size={22} />
      </View>
      <Text style={s.walletName}>{wallet.name}</Text>
      <View style={s.walletArrow}>
        <Text style={s.walletArrowText}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ConnectWalletSheet({ visible, onClose, onImportSuccess }) {
  const [view, setView]       = useState("main"); // main | import
  const [privKey, setPrivKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [keyError, setKeyError] = useState("");
  const [importing, setImporting] = useState(false);
  const [connecting, setConnecting] = useState(null);

  const slideY   = useRef(new Animated.Value(SHEET_H)).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setView("main");
      setPrivKey(""); setKeyError(""); setConnecting(null);
      Animated.parallel([
        Animated.spring(slideY,   { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }),
        Animated.timing(backdrop, { toValue: 1, useNativeDriver: true, duration: 250 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideY,   { toValue: SHEET_H, useNativeDriver: true, duration: 220 }),
        Animated.timing(backdrop, { toValue: 0,        useNativeDriver: true, duration: 200 }),
      ]).start();
    }
  }, [visible]);

  async function handleWalletConnect(wallet) {
    setConnecting(wallet.id);
    try {
      // Try the deep link first — if wallet app is installed it opens automatically
      const canOpen = await Linking.canOpenURL(wallet.scheme);
      const url = canOpen ? wallet.deepLink : (
        Platform.OS === "ios" ? wallet.storeIos : wallet.storeAndroid
      );
      await Linking.openURL(url);
    } catch {
      // Fallback to store
      const store = Platform.OS === "ios" ? wallet.storeIos : wallet.storeAndroid;
      Linking.openURL(store).catch(() => {});
    } finally {
      setConnecting(null);
    }
  }

  async function handleImport() {
    if (!privKey.trim()) { setKeyError("Paste your private key above."); return; }
    setKeyError("");
    setImporting(true);
    try {
      const keyBytes = decodePrivateKey(privKey);
      if (!keyBytes) { setKeyError("Invalid key. Use base58, hex, or byte-array format."); return; }
      const keypair = Keypair.fromSecretKey(keyBytes);
      const address = keypair.publicKey.toBase58();
      await SecureStore.setItemAsync(IMPORTED_KEY_STORE,  Buffer.from(keyBytes).toString("base64"));
      await SecureStore.setItemAsync(IMPORTED_ADDR_STORE, address);
      setPrivKey("");
      walletImportSignal.emit(address);
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
    } catch {}
  }

  function renderHeader(title, showBack = false) {
    return (
      <View style={s.header}>
        {showBack
          ? <TouchableOpacity style={s.headerBtn} onPress={() => setView("main")}>
              <ChevronLeft size={20} color={TEXT_SEC} />
            </TouchableOpacity>
          : <TouchableOpacity style={s.headerBtn} onPress={onClose}>
              <ChevronLeft size={20} color={TEXT_SEC} />
            </TouchableOpacity>}
        <Text style={s.headerTitle}>{title}</Text>
        <TouchableOpacity style={s.headerBtn}>
          <HelpCircle size={18} color={TEXT_SEC} />
        </TouchableOpacity>
      </View>
    );
  }

  function renderMain() {
    const phantom = WALLETS[0];
    const rest    = WALLETS.slice(1);
    return (
      <View style={s.viewBody}>
        {renderHeader("Connect an existing wallet")}

        <Text style={s.subtitle}>
          Connect with {WALLETS.map(w => w.name).join(", ")}
        </Text>

        {/* Primary — Phantom */}
        <TouchableOpacity
          style={s.phantomBtn}
          onPress={() => handleWalletConnect(phantom)}
          activeOpacity={0.85}
          disabled={!!connecting}
        >
          {connecting === phantom.id
            ? <ActivityIndicator size={18} color="#fff" />
            : <>
                <phantom.Icon size={20} color="#FFFFFF" />
                <Text style={s.phantomBtnText}>Continue with {phantom.name}</Text>
              </>}
        </TouchableOpacity>

        {/* Separator */}
        <View style={s.orRow}>
          <View style={s.orLine} />
          <Text style={s.orText}>or select a wallet from the list below</Text>
          <View style={s.orLine} />
        </View>

        {/* Other wallets */}
        <View style={s.walletGroup}>
          {rest.map((w, i) => (
            <WalletRow
              key={w.id}
              wallet={w}
              onPress={handleWalletConnect}
              isFirst={i === 0}
              isLast={i === rest.length - 1}
            />
          ))}
        </View>

        {/* Import key fallback */}
        <TouchableOpacity style={s.importLink} onPress={() => setView("import")}>
          <Key size={13} color={TEXT_MUTED} />
          <Text style={s.importLinkText}>Import private key instead</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function renderImport() {
    return (
      <View style={s.viewBody}>
        {renderHeader("Import Private Key", true)}

        <Text style={s.fieldLabel}>Private key</Text>
        <Text style={s.fieldHint}>Paste your base58, hex, or byte-array key.</Text>

        <View style={[s.inputBox, keyError && s.inputBoxError]}>
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
            <TouchableOpacity style={s.keyActionBtn} onPress={() => setShowKey(v => !v)}>
              {showKey ? <EyeOff size={16} color={TEXT_SEC} /> : <Eye size={16} color={TEXT_SEC} />}
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

        <View style={s.securityNote}>
          <ShieldCheck size={14} color={GREEN} />
          <Text style={s.securityText}>
            Your key is encrypted on-device and never transmitted.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, s.backdrop, { opacity: backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[s.sheet, { transform: [{ translateY: slideY }] }]}>
        <View style={s.handle} />
        <View style={s.sheetGlow} pointerEvents="none" />

        {view === "main"   && renderMain()}
        {view === "import" && renderImport()}
      </Animated.View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  sheet: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    height: SHEET_H,
    backgroundColor: SHEET_BG,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderWidth: 1, borderBottomWidth: 0,
    borderColor: BORDER_LT,
    overflow: "hidden",
  },
  sheetGlow: {
    position: "absolute",
    top: -60, left: "15%", right: "15%",
    height: 120, borderRadius: 60,
    backgroundColor: GREEN_GLOW,
  },
  handle: {
    width: 40, height: 4,
    backgroundColor: BORDER_LT, borderRadius: 2,
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
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
  },
  headerBtn: {
    width: 36, height: 36,
    alignItems: "center", justifyContent: "center",
    backgroundColor: GLASS, borderRadius: 12,
    borderWidth: 1, borderColor: BORDER,
  },
  headerTitle: {
    color: TEXT_PRI, fontSize: 16, fontWeight: "700",
    letterSpacing: 0.1, flex: 1, textAlign: "center",
    marginHorizontal: 8,
  },

  subtitle: {
    color: TEXT_SEC,
    fontSize: 13, textAlign: "center", lineHeight: 20,
    marginBottom: 20,
  },

  // ── Phantom primary button ──
  phantomBtn: {
    flexDirection: "row",
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#6C52C3",
    borderRadius: 18,
    paddingVertical: 16,
    gap: 10,
    marginBottom: 20,
    shadowColor: "#6C52C3",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 14, elevation: 6,
  },

  phantomBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  // ── Separator ──
  orRow: {
    flexDirection: "row", alignItems: "center",
    gap: 8, marginBottom: 16,
  },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: BORDER },
  orText: { color: TEXT_MUTED, fontSize: 11, fontWeight: "500", textAlign: "center", flex: 2 },

  // ── Wallet list ──
  walletGroup: {
    backgroundColor: GLASS,
    borderRadius: 18, borderWidth: 1, borderColor: BORDER,
    overflow: "hidden",
    marginBottom: 16,
  },
  walletRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 16,
    gap: 14,
  },
  walletRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  walletIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },

  walletName: { color: TEXT_PRI, fontSize: 15, fontWeight: "600", flex: 1 },
  walletArrow: { padding: 4 },
  walletArrowText: { color: TEXT_MUTED, fontSize: 20, lineHeight: 20 },

  // ── Import link ──
  importLink: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 6,
    paddingVertical: 10,
  },
  importLinkText: {
    color: TEXT_MUTED, fontSize: 13, fontWeight: "500",
  },

  // ── Import view fields ──
  fieldLabel: {
    color: TEXT_SEC, fontSize: 13, fontWeight: "600",
    letterSpacing: 0.5, marginTop: 4, marginBottom: 8,
  },
  fieldHint: {
    color: TEXT_MUTED, fontSize: 12, marginBottom: 10, marginTop: -4,
  },
  inputBox: {
    backgroundColor: GLASS, borderRadius: 14,
    borderWidth: 1, borderColor: BORDER,
    flexDirection: "row", alignItems: "flex-start",
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10,
    minHeight: 80, marginBottom: 8,
  },
  inputBoxError: { borderColor: "rgba(248,113,113,0.45)" },
  textInput: { flex: 1, color: TEXT_PRI, fontSize: 15, paddingVertical: 0 },
  keyInput: {
    fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  keyActions: { flexDirection: "column", gap: 8, paddingLeft: 8 },
  keyActionBtn: {
    width: 30, height: 30,
    alignItems: "center", justifyContent: "center",
    backgroundColor: GLASS_MED, borderRadius: 8,
    borderWidth: 1, borderColor: BORDER,
  },
  errorText: { color: DANGER, fontSize: 12, marginBottom: 10 },

  cta: { marginTop: 8, marginBottom: 12 },
  ctaText: { color: "#000", fontSize: 16, fontWeight: "800" },

  securityNote: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: GREEN_DIM, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: "rgba(74,222,128,0.18)",
  },
  securityText: { color: TEXT_SEC, fontSize: 12, lineHeight: 17, flex: 1 },
});
