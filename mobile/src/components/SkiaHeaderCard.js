/**
 * SkiaHeaderCard — premium fintech header with weight.
 * Dark void base · subtle edge glow · clear balance card · identity bar.
 */

import RollingNumber from "./RollingNumber";
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Platform, Dimensions, Modal, Pressable,
} from "react-native";
import { F } from "../theme/fonts";
import {
  Canvas, Rect, Group, RadialGradient, LinearGradient, vec,
} from "@shopify/react-native-skia";
import {
  LogOut, Copy, Beaker, Wifi, WifiOff, AlignLeft,
  ChevronLeft, Zap, History, MoreHorizontal,
} from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import HomieLogoMain from "./HomieLogoMain";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: SCREEN_W } = Dimensions.get("window");

const TOP_H    = 44;
const CARD_H_B = 100;
const PAD_V    = 12;
const PAD_H    = 18;
const GAP      = 12;
const CARD_H   = PAD_V + TOP_H + GAP + CARD_H_B + PAD_V;

const GREEN  = "#4ADE80";
const PURPLE = "#A78BFA";
const YELLOW = "#FBBF24";
const RED    = "#F87171";
const GLASS  = "rgba(255,255,255,0.05)";
const BDR    = "rgba(255,255,255,0.09)";
const MUTED  = "rgba(255,255,255,0.38)";
const SEC    = "rgba(255,255,255,0.60)";

function fmtUsd(v) {
  if (v == null || isNaN(v)) return null;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 10_000)    return `$${(v / 1_000).toFixed(1)}k`;
  return `$${v.toFixed(2)}`;
}

// ─── Premium bottom-sheet menu ───────────────────────────────────────────────
function MenuSheet({
  visible, onClose,
  walletAddress, copied, onCopy,
  onHistory, onAutopilot, autopilotActive,
  network, onNetworkToggle,
  sandboxMode, onSandboxToggle,
  onLogout,
  insets,
}) {
  const isDevnet = network === "devnet";

  function row(Icon, iconColor, label, sublabel, onPress, tint) {
    return (
      <TouchableOpacity style={m.row} onPress={() => { onClose(); onPress?.(); }} activeOpacity={0.7}>
        <View style={[m.rowIcon, { backgroundColor: `${iconColor}12`, borderColor: `${iconColor}22` }]}>
          <Icon size={16} color={iconColor} strokeWidth={1.9} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={m.rowLabel}>{label}</Text>
          {sublabel ? <Text style={m.rowSub}>{sublabel}</Text> : null}
        </View>
        {tint && <View style={[m.dot, { backgroundColor: tint }]} />}
      </TouchableOpacity>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      {/* Scrim */}
      <Pressable style={m.scrim} onPress={onClose}>
        {/* bottom sheet — not pressable so taps don't close */}
        <Pressable style={[m.sheet, { paddingBottom: insets.bottom + 12 }]} onPress={() => {}}>

          {/* Handle */}
          <View style={m.handle} />

          {/* Wallet section */}
          <View style={m.section}>
            <Text style={m.sectionLabel}>WALLET</Text>
            <TouchableOpacity style={m.row} onPress={() => { onClose(); onCopy?.(); }} activeOpacity={0.7}>
              <View style={[m.rowIcon, { backgroundColor: `${SEC}12`, borderColor: `${SEC}18` }]}>
                <Copy size={16} color={SEC} strokeWidth={1.9} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={m.rowLabel}>{copied ? "Copied!" : "Copy Address"}</Text>
                {walletAddress && (
                  <Text style={m.rowAddr}>
                    {walletAddress.slice(0, 6)}…{walletAddress.slice(-6)}
                  </Text>
                )}
              </View>
              {copied && <View style={[m.dot, { backgroundColor: GREEN }]} />}
            </TouchableOpacity>

            {row(History, SEC, "Chat History", null, onHistory)}
          </View>

          <View style={m.divider} />

          {/* Features section */}
          <View style={m.section}>
            <Text style={m.sectionLabel}>FEATURES</Text>

            <TouchableOpacity style={m.row} onPress={() => { onClose(); onAutopilot?.(); }} activeOpacity={0.7}>
              <View style={[m.rowIcon, {
                backgroundColor: autopilotActive ? `${GREEN}14` : `${SEC}0D`,
                borderColor:     autopilotActive ? `${GREEN}28` : `${SEC}18`,
              }]}>
                <Zap size={16} color={autopilotActive ? GREEN : SEC} strokeWidth={1.9} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[m.rowLabel, autopilotActive && { color: "#fff" }]}>Autopilot</Text>
                <Text style={[m.rowSub, autopilotActive && { color: `${GREEN}99` }]}>
                  {autopilotActive ? "Active — monitoring drift" : "Off"}
                </Text>
              </View>
              <View style={[m.pill, autopilotActive ? m.pillOn : m.pillOff]}>
                <Text style={[m.pillText, autopilotActive && { color: GREEN }]}>
                  {autopilotActive ? "ON" : "OFF"}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={m.row} onPress={() => { onClose(); onSandboxToggle?.(); }} activeOpacity={0.7}>
              <View style={[m.rowIcon, {
                backgroundColor: sandboxMode ? `${PURPLE}14` : `${SEC}0D`,
                borderColor:     sandboxMode ? `${PURPLE}28` : `${SEC}18`,
              }]}>
                <Beaker size={16} color={sandboxMode ? PURPLE : SEC} strokeWidth={1.9} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[m.rowLabel, sandboxMode && { color: "#fff" }]}>Sandbox</Text>
                <Text style={[m.rowSub, sandboxMode && { color: `${PURPLE}99` }]}>
                  {sandboxMode ? "Paper trading — no real funds" : "Off"}
                </Text>
              </View>
              <View style={[m.pill, sandboxMode ? m.pillPurple : m.pillOff]}>
                <Text style={[m.pillText, sandboxMode && { color: PURPLE }]}>
                  {sandboxMode ? "ON" : "OFF"}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={m.divider} />

          {/* Network section */}
          <View style={m.section}>
            <Text style={m.sectionLabel}>NETWORK</Text>
            <TouchableOpacity style={m.row} onPress={() => { onClose(); onNetworkToggle?.(); }} activeOpacity={0.7}>
              <View style={[m.rowIcon, {
                backgroundColor: isDevnet ? `${YELLOW}14` : `${GREEN}12`,
                borderColor:     isDevnet ? `${YELLOW}28` : `${GREEN}22`,
              }]}>
                {isDevnet
                  ? <WifiOff size={16} color={YELLOW} strokeWidth={1.9} />
                  : <Wifi    size={16} color={GREEN}  strokeWidth={1.9} />
                }
              </View>
              <View style={{ flex: 1 }}>
                <Text style={m.rowLabel}>{isDevnet ? "Switch to Mainnet" : "Mainnet"}</Text>
                <Text style={m.rowSub}>{isDevnet ? "Currently on devnet" : "Live network"}</Text>
              </View>
              {isDevnet && (
                <View style={[m.pill, { backgroundColor: `${YELLOW}14`, borderColor: `${YELLOW}28` }]}>
                  <Text style={[m.pillText, { color: YELLOW }]}>DEV</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          <View style={m.divider} />

          {/* Log out */}
          <View style={m.section}>
            <TouchableOpacity style={m.row} onPress={() => { onClose(); onLogout?.(); }} activeOpacity={0.7}>
              <View style={[m.rowIcon, { backgroundColor: `${RED}12`, borderColor: `${RED}22` }]}>
                <LogOut size={16} color={RED} strokeWidth={1.9} />
              </View>
              <Text style={[m.rowLabel, { color: RED }]}>Log Out</Text>
            </TouchableOpacity>
          </View>

        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function SkiaHeaderCard({
  walletAddress, solBalance, portfolioUsd, balanceLoading,
  onLogout, onHistory, onBack, onAutopilot, autopilotActive = false,
  network = "mainnet", onNetworkToggle,
  sandboxMode = false, onSandboxToggle,
}) {
  const insets = useSafeAreaInsets();
  const totalH = CARD_H + insets.top;

  const [menuOpen, setMenuOpen] = useState(false);
  const [copied,   setCopied]   = useState(false);

  function shortAddr(a) {
    if (!a) return "—";
    return `${a.slice(0, 4)}...${a.slice(-4)}`;
  }

  async function handleCopy() {
    if (!walletAddress) return;
    await Clipboard.setStringAsync(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const hasValidUsd = portfolioUsd != null && (portfolioUsd > 0 || solBalance === 0);
  const usdText     = hasValidUsd ? fmtUsd(portfolioUsd) : null;
  const isDevnet    = network === "devnet";

  return (
    <View style={[styles.wrapper, { height: totalH }]}>

      {/* ── Skia background ── */}
      <Canvas style={[StyleSheet.absoluteFill, { height: totalH }]}>
        {/* Void base */}
        <Rect x={0} y={0} width={SCREEN_W} height={totalH} color="rgba(2,6,3,1)" />

        {/* Top-right mint glow — subtle brand presence */}
        <Group opacity={0.20}>
          <Rect x={0} y={0} width={SCREEN_W} height={totalH}>
            <RadialGradient
              c={vec(SCREEN_W * 0.85, insets.top * 0.5)}
              r={SCREEN_W * 0.55}
              colors={["rgba(74,222,128,1)", "rgba(74,222,128,0)"]}
            />
          </Rect>
        </Group>

        {/* Left ambient fill — balances composition */}
        <Group opacity={0.07}>
          <Rect x={0} y={0} width={SCREEN_W} height={totalH}>
            <RadialGradient
              c={vec(SCREEN_W * 0.10, totalH * 0.6)}
              r={SCREEN_W * 0.45}
              colors={["rgba(110,231,183,1)", "rgba(110,231,183,0)"]}
            />
          </Rect>
        </Group>

        {/* Bottom fade — transitions cleanly into chat */}
        <Group opacity={0.90}>
          <Rect x={0} y={totalH * 0.55} width={SCREEN_W} height={totalH * 0.45}>
            <LinearGradient
              start={vec(0, 0)} end={vec(0, totalH * 0.45)}
              colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.40)"]}
            />
          </Rect>
        </Group>

        {/* Separator line — mint tinted */}
        <Rect x={0} y={totalH - 1} width={SCREEN_W} height={1}>
          <LinearGradient
            start={vec(0, 0)} end={vec(SCREEN_W, 0)}
            colors={[
              "rgba(74,222,128,0)",
              "rgba(74,222,128,0.28)",
              "rgba(74,222,128,0.35)",
              "rgba(74,222,128,0.10)",
              "rgba(74,222,128,0)",
            ]}
          />
        </Rect>
      </Canvas>

      {/* ── Content ── */}
      <View style={[styles.content, {
        paddingTop: insets.top + PAD_V,
        paddingBottom: PAD_V,
        paddingHorizontal: PAD_H,
        gap: GAP,
      }]}>

        {/* ── Identity bar ── */}
        <View style={[styles.topBar, { height: TOP_H }]}>

          {/* Back to home (if available) or history drawer */}
          {onBack ? (
            <TouchableOpacity style={styles.iconBtn} onPress={onBack} activeOpacity={0.75}>
              <ChevronLeft size={19} color="rgba(255,255,255,0.60)" strokeWidth={2.2} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => { setMenuOpen(false); onHistory?.(); }}
              activeOpacity={0.75}
            >
              <AlignLeft size={17} color="rgba(255,255,255,0.60)" strokeWidth={2.2} />
            </TouchableOpacity>
          )}

          {/* Brand — logo + name tight */}
          <View style={styles.brandRow}>
            <HomieLogoMain size={22} />
            <Text style={styles.brandName}>HOMIE</Text>
            {isDevnet && (
              <View style={styles.badge}>
                <Text style={[styles.badgeText, { color: YELLOW }]}>devnet</Text>
              </View>
            )}
            {sandboxMode && (
              <View style={[styles.badge, styles.badgePurple]}>
                <Text style={[styles.badgeText, { color: PURPLE }]}>sandbox</Text>
              </View>
            )}
          </View>

          <View style={{ flex: 1 }} />

          {/* Overflow — opens bottom sheet */}
          <TouchableOpacity
            style={[styles.iconBtn, menuOpen && styles.iconBtnActive]}
            onPress={() => setMenuOpen(true)}
            activeOpacity={0.75}
          >
            <MoreHorizontal size={17} color="rgba(255,255,255,0.60)" strokeWidth={2.2} />
          </TouchableOpacity>
        </View>

        {/* ── Balance card ── */}
        <View style={[styles.balanceCard, { height: CARD_H_B }]}>

          <Text style={[styles.balLabel, sandboxMode && styles.balLabelSandbox]}>
            {sandboxMode ? "Virtual Portfolio" : "Total Portfolio"}
          </Text>

          <View style={styles.balNumRow}>
            {balanceLoading ? (
              <ActivityIndicator size="small" color={GREEN} />
            ) : usdText != null ? (
              <RollingNumber value={usdText} fontSize={30} color="#FFFFFF" fontWeight="800" />
            ) : solBalance !== null ? (
              <>
                <RollingNumber value={solBalance.toFixed(4)} fontSize={30} color="#FFFFFF" fontWeight="800" />
                <Text style={[styles.unit, sandboxMode && styles.unitSandbox]}>
                  {sandboxMode ? " vSOL" : " SOL"}
                </Text>
              </>
            ) : (
              <Text style={styles.balMuted}>—</Text>
            )}
          </View>

          {/* Footer: SOL amount left · wallet address right */}
          <View style={styles.balFooter}>
            <Text style={[styles.solSub, sandboxMode && styles.solSubSandbox]}>
              {usdText != null && solBalance != null
                ? `${solBalance.toFixed(4)}${sandboxMode ? " vSOL" : " SOL"}`
                : ""}
            </Text>

            <TouchableOpacity style={styles.addrRow} onPress={handleCopy} activeOpacity={0.65}>
              <Text style={styles.addrText}>
                {copied ? "copied ✓" : shortAddr(walletAddress)}
              </Text>
              {!copied && <Copy size={10} color="rgba(255,255,255,0.25)" strokeWidth={2} />}
            </TouchableOpacity>
          </View>
        </View>

      </View>

      {/* ── Bottom sheet menu ── */}
      <MenuSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        walletAddress={walletAddress}
        copied={copied}
        onCopy={handleCopy}
        onHistory={onHistory}
        onAutopilot={onAutopilot}
        autopilotActive={autopilotActive}
        network={network}
        onNetworkToggle={onNetworkToggle}
        sandboxMode={sandboxMode}
        onSandboxToggle={onSandboxToggle}
        onLogout={onLogout}
        insets={insets}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: "100%", overflow: "visible", zIndex: 10 },
  content: { flex: 1 },

  topBar: { flexDirection: "row", alignItems: "center" },

  iconBtn: {
    width: 36, height: 36, borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.09)",
    alignItems: "center", justifyContent: "center",
  },
  iconBtnActive: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderColor: "rgba(255,255,255,0.15)",
  },

  brandRow: { flexDirection: "row", alignItems: "center", gap: 7, marginLeft: 10 },
  brandName: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12, fontFamily: F.headBold, letterSpacing: 2.8,
  },

  badge: {
    backgroundColor: "rgba(251,191,36,0.12)", borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: "rgba(251,191,36,0.22)",
  },
  badgePurple: {
    backgroundColor: "rgba(167,139,250,0.12)",
    borderColor: "rgba(167,139,250,0.22)",
  },
  badgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },

  // ── Balance card ──
  balanceCard: {
    backgroundColor: "rgba(255,255,255,0.055)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    paddingHorizontal: 18,
    paddingVertical: 14,
    justifyContent: "space-between",
  },

  balLabel: { color: "rgba(255,255,255,0.45)", fontSize: 11, fontFamily: F.semibold, letterSpacing: 0.3 },
  balLabelSandbox: { color: "rgba(167,139,250,0.70)" },

  balNumRow: { flexDirection: "row", alignItems: "baseline" },
  unit: { color: GREEN, fontSize: 15, fontFamily: F.headSemi, marginLeft: 2 },
  unitSandbox: { color: PURPLE },
  balMuted: { color: "rgba(255,255,255,0.28)", fontSize: 26, fontFamily: F.headBold },

  balFooter: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  solSub: { color: "rgba(255,255,255,0.42)", fontSize: 12, fontFamily: F.semibold },
  solSubSandbox: { color: "rgba(167,139,250,0.55)" },

  addrRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  addrText: {
    color: "rgba(255,255,255,0.42)",
    fontSize: 11, fontWeight: "600",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
});

// ─── Bottom-sheet styles ──────────────────────────────────────────────────────
const m = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.60)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "rgb(8,13,9)",
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
    paddingTop: 12,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignSelf: "center", marginBottom: 20,
  },

  section: { paddingHorizontal: 20, gap: 2 },
  sectionLabel: {
    color: MUTED, fontSize: 10, fontFamily: F.semibold,
    letterSpacing: 1.4, marginBottom: 6, marginLeft: 4,
  },

  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginHorizontal: 20, marginVertical: 12,
  },

  row: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingVertical: 11, paddingHorizontal: 4,
  },
  rowIcon: {
    width: 38, height: 38, borderRadius: 12,
    borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
  rowLabel: { color: SEC, fontSize: 15, fontFamily: F.semibold },
  rowSub:   { color: MUTED, fontSize: 12, fontFamily: F.regular, marginTop: 1 },
  rowAddr:  {
    color: MUTED, fontSize: 11, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    marginTop: 2,
  },

  dot: { width: 8, height: 8, borderRadius: 4 },

  pill: {
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.10)",
  },
  pillOn:     { backgroundColor: `${GREEN}14`, borderColor: `${GREEN}28` },
  pillOff:    { backgroundColor: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.10)" },
  pillPurple: { backgroundColor: `${PURPLE}14`, borderColor: `${PURPLE}28` },
  pillText:   { fontSize: 11, fontFamily: F.headBold, letterSpacing: 0.6, color: MUTED },
});
