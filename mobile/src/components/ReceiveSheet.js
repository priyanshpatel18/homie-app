/**
 * ReceiveSheet — Shows the wallet QR code + address for easy fund deposits.
 *
 * Used from HomeScreen ("Add some SOL") and ChatScreen (inline card).
 */

import { useRef, useEffect, useState } from "react";
import {
  View, Text, Modal, TouchableOpacity, StyleSheet,
  Animated, Pressable, Dimensions, Platform,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Copy, Check, X, QrCode } from "lucide-react-native";
import QRCodeStyled from "react-native-qrcode-styled";
import { F } from "../theme/fonts";

// ─── Palette ──────────────────────────────────────────────────────────────────
const GREEN      = "#4ADE80";
const GREEN_DIM  = "rgba(74,222,128,0.55)";
const GREEN_BG   = "rgba(74,222,128,0.08)";
const GLASS      = "rgba(255,255,255,0.06)";
const BORDER     = "rgba(255,255,255,0.10)";
const BORDER_LT  = "rgba(255,255,255,0.16)";
const TEXT_PRI   = "#FFFFFF";
const TEXT_SEC   = "rgba(255,255,255,0.58)";
const TEXT_MUTED = "rgba(255,255,255,0.28)";
const SHEET_BG   = "rgba(7,9,8,0.97)";

const { height: SCREEN_H } = Dimensions.get("window");
const SHEET_H = Math.min(SCREEN_H * 0.65, 520);
const QR_SIZE = Math.min(Dimensions.get("window").width - 120, 220);

// ─── Main component ───────────────────────────────────────────────────────────
export default function ReceiveSheet({ visible, walletAddress, onClose }) {
  const [copied, setCopied] = useState(false);

  const slideY   = useRef(new Animated.Value(SHEET_H)).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setCopied(false);
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

  async function handleCopy() {
    if (!walletAddress) return;
    try {
      await Clipboard.setStringAsync(walletAddress);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  }

  const shortAddr = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-6)}`
    : "";

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, s.backdrop, { opacity: backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[s.sheet, { transform: [{ translateY: slideY }] }]}>
        <View style={s.handle} />

        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft} />
          <Text style={s.headerTitle}>Receive SOL</Text>
          <TouchableOpacity style={s.closeBtn} onPress={onClose} activeOpacity={0.7}>
            <X size={18} color={TEXT_SEC} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>

        <View style={s.body}>
          {/* QR Code */}
          <View style={s.qrContainer}>
            <View style={s.qrInner}>
              {walletAddress ? (
                <QRCodeStyled
                  data={walletAddress}
                  style={{ backgroundColor: "#FFFFFF" }}
                  padding={16}
                  pieceSize={6}
                  pieceBorderRadius={2}
                  color="#000000"
                  outerEyesOptions={{
                    borderRadius: 6,
                    color: "#000000",
                  }}
                  innerEyesOptions={{
                    borderRadius: 3,
                    color: "#000000",
                  }}
                />
              ) : (
                <View style={s.qrPlaceholder}>
                  <QrCode size={48} color={TEXT_MUTED} strokeWidth={1.5} />
                </View>
              )}
            </View>
          </View>

          {/* Description */}
          <Text style={s.instruction}>
            Scan this QR code or copy the address below to send SOL to your wallet.
          </Text>

          {/* Address + Copy */}
          <TouchableOpacity
            style={[s.addressCard, copied && s.addressCardCopied]}
            onPress={handleCopy}
            activeOpacity={0.7}
          >
            <View style={s.addressLeft}>
              <Text style={s.addressLabel}>Wallet address</Text>
              <Text style={s.addressText} numberOfLines={1}>
                {walletAddress || "—"}
              </Text>
              <Text style={s.addressShort}>{shortAddr}</Text>
            </View>
            <View style={[s.copyBtn, copied && s.copyBtnCopied]}>
              {copied
                ? <Check size={16} color={GREEN} strokeWidth={2.5} />
                : <Copy size={16} color={TEXT_SEC} strokeWidth={2} />
              }
            </View>
          </TouchableOpacity>

          {copied && (
            <Text style={s.copiedLabel}>Copied to clipboard</Text>
          )}

          {/* Network note */}
          <Text style={s.networkNote}>
            Only send SOL or SPL tokens on the Solana network. Sending other assets may result in loss.
          </Text>
        </View>
      </Animated.View>
    </Modal>
  );
}

// ─── Inline QR Card — collapsible, for embedding in chat messages ─────────────
export function InlineWalletQR({ walletAddress, onCopy }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const expandAnim = useRef(new Animated.Value(0)).current;

  function toggle() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const next = !expanded;
    setExpanded(next);
    Animated.spring(expandAnim, {
      toValue: next ? 1 : 0,
      useNativeDriver: false,
      tension: 80,
      friction: 12,
    }).start();
  }

  async function handleCopy() {
    if (!walletAddress) return;
    try {
      await Clipboard.setStringAsync(walletAddress);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setCopied(true);
      onCopy?.();
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  }

  const shortAddr = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-6)}`
    : "";

  // Animated height: 0 → auto is tricky in RN, so we use maxHeight + opacity
  const contentOpacity = expandAnim.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0, 1] });
  const contentMaxH    = expandAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 320] });
  const chevronRotate  = expandAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });

  return (
    <View style={inl.wrapper}>
      {/* ── Collapsed anchor ── */}
      <TouchableOpacity style={inl.anchor} onPress={toggle} activeOpacity={0.7}>
        <QrCode size={14} color={GREEN_DIM} strokeWidth={2} />
        <Text style={inl.anchorText}>
          {expanded ? "Hide wallet QR" : "Show wallet QR & address"}
        </Text>
        <Animated.Text style={[inl.chevron, { transform: [{ rotate: chevronRotate }] }]}>
          ↓
        </Animated.Text>
      </TouchableOpacity>

      {/* ── Expanded content ── */}
      <Animated.View style={[inl.expandable, { maxHeight: contentMaxH, opacity: contentOpacity }]}>
        <View style={inl.container}>
          {/* Compact QR */}
          <View style={inl.qrWrap}>
            {walletAddress ? (
              <QRCodeStyled
                data={walletAddress}
                style={{ backgroundColor: "#FFFFFF" }}
                padding={10}
                pieceSize={4}
                pieceBorderRadius={1}
                color="#000000"
                outerEyesOptions={{ borderRadius: 4, color: "#000000" }}
                innerEyesOptions={{ borderRadius: 2, color: "#000000" }}
              />
            ) : null}
          </View>

          {/* Address */}
          <TouchableOpacity style={inl.addrRow} onPress={handleCopy} activeOpacity={0.7}>
            <Text style={inl.addrText}>{shortAddr}</Text>
            {copied
              ? <Check size={13} color={GREEN} strokeWidth={2.5} />
              : <Copy size={13} color={TEXT_SEC} strokeWidth={2} />
            }
          </TouchableOpacity>
          {copied && <Text style={inl.copiedText}>Copied to clipboard</Text>}
        </View>
      </Animated.View>
    </View>
  );
}

// ─── Sheet Styles ─────────────────────────────────────────────────────────────
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
  handle: {
    width: 40, height: 4,
    backgroundColor: BORDER_LT, borderRadius: 2,
    alignSelf: "center",
    marginTop: 12, marginBottom: 4,
  },

  // ── Header ──
  header: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 12,
  },
  headerLeft: { width: 36 },
  headerTitle: {
    color: TEXT_PRI, fontSize: 16, fontFamily: F.headBold,
    letterSpacing: 0.1, textAlign: "center", flex: 1,
  },
  closeBtn: {
    width: 36, height: 36,
    alignItems: "center", justifyContent: "center",
    backgroundColor: GLASS, borderRadius: 12,
    borderWidth: 1, borderColor: BORDER,
  },

  body: {
    flex: 1, paddingHorizontal: 24, alignItems: "center",
  },

  // ── QR ──
  qrContainer: {
    padding: 3,
    borderRadius: 20,
    backgroundColor: GLASS,
    borderWidth: 1, borderColor: BORDER,
    marginBottom: 18,
  },
  qrInner: {
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  qrPlaceholder: {
    width: QR_SIZE, height: QR_SIZE,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
  },

  instruction: {
    color: TEXT_SEC, fontSize: 13, lineHeight: 19,
    fontFamily: F.regular, textAlign: "center",
    marginBottom: 20, paddingHorizontal: 10,
  },

  // ── Address card ──
  addressCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: GLASS, borderRadius: 16,
    borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: 16, paddingVertical: 14,
    width: "100%",
  },
  addressCardCopied: {
    borderColor: "rgba(74,222,128,0.30)",
    backgroundColor: GREEN_BG,
  },
  addressLeft: { flex: 1, marginRight: 12 },
  addressLabel: {
    color: TEXT_MUTED, fontSize: 10, fontFamily: F.medium,
    letterSpacing: 0.5, marginBottom: 4, textTransform: "uppercase",
  },
  addressText: {
    color: TEXT_PRI, fontSize: 12, fontFamily: F.regular,
    ...Platform.select({ ios: { fontFamily: "Menlo" }, android: { fontFamily: "monospace" } }),
  },
  addressShort: { display: "none" },  // hidden — full address is shown
  copyBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1, borderColor: BORDER,
    alignItems: "center", justifyContent: "center",
  },
  copyBtnCopied: {
    backgroundColor: GREEN_BG,
    borderColor: "rgba(74,222,128,0.25)",
  },

  copiedLabel: {
    color: GREEN, fontSize: 12, fontFamily: F.medium,
    marginTop: 8,
  },

  networkNote: {
    color: TEXT_MUTED, fontSize: 11, lineHeight: 16,
    fontFamily: F.regular, textAlign: "center",
    marginTop: 16, paddingHorizontal: 20,
  },
});

// ─── Inline Card Styles ───────────────────────────────────────────────────────
const inl = StyleSheet.create({
  // Outer wrapper — no visual chrome, just groups anchor + expandable
  wrapper: {
    marginTop: 12,
  },

  // ── Collapsed anchor link ──
  anchor: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "flex-start",
    paddingVertical: 8, paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    borderWidth: 1, borderColor: BORDER,
  },
  anchorText: {
    color: GREEN_DIM, fontSize: 13, fontFamily: F.medium,
  },
  chevron: {
    color: GREEN_DIM, fontSize: 13, marginLeft: 2,
  },

  // ── Expandable content ──
  expandable: {
    overflow: "hidden",
  },
  container: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 16,
    borderWidth: 1, borderColor: BORDER,
    padding: 16, marginTop: 8,
  },
  qrWrap: {
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    marginBottom: 10,
  },
  addrRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: BORDER,
  },
  addrText: {
    color: TEXT_SEC, fontSize: 12,
    ...Platform.select({ ios: { fontFamily: "Menlo" }, android: { fontFamily: "monospace" } }),
  },
  copiedText: {
    color: GREEN, fontSize: 11, fontFamily: F.medium, marginTop: 6,
  },
});
