/**
 * SandboxDashboard — TradingView-style paper trading dashboard.
 *
 * Sections:
 *  1. Header    — title, reset, close
 *  2. Portfolio card — animated total value, PnL
 *  3. Mini line chart — portfolio performance over time
 *  4. Asset allocation — donut chart + breakdown bars
 *  5. History timeline — past simulated actions
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  ScrollView, Animated, Dimensions, ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Path, Defs, LinearGradient as SvgGradient, Stop,
  Circle, Line, Text as SvgText,
} from "react-native-svg";
import {
  TrendingUp, TrendingDown, RotateCcw, X,
  ArrowRightLeft, Layers, RefreshCw, FlaskConical,
} from "lucide-react-native";
import { calculatePnL, fetchTokenPricesUsd, displaySym } from "../sandbox/sandboxEngine";

const { width: SW } = Dimensions.get("window");

// ─── Palette ──────────────────────────────────────────────────────────────────
const BLACK         = "#000000";
const SURFACE       = "#0A0A0A";
const GLASS         = "rgba(255,255,255,0.06)";
const GLASS_MED     = "rgba(255,255,255,0.09)";
const GLASS_BORDER  = "rgba(255,255,255,0.10)";
const GLASS_BORDER_L= "rgba(255,255,255,0.16)";
const TEXT_PRI      = "#FFFFFF";
const TEXT_SEC      = "rgba(255,255,255,0.65)";
const TEXT_MUTED    = "rgba(255,255,255,0.35)";
const GREEN         = "#4ADE80";
const RED           = "#F87171";
const WARN          = "#FBBF24";
const VIOLET        = "#A78BFA";
const VIOLET_LIGHT  = "#C4B5FD";
const VIOLET_DIM    = "rgba(167,139,250,0.08)";
const VIOLET_BORDER = "rgba(167,139,250,0.22)";
const VIOLET_GLOW   = "rgba(167,139,250,0.35)";

// Token color palette for donut chart
const TOKEN_COLORS = {
  SOL:  "#A78BFA",   // violet — primary
  USDC: "#60A5FA",   // blue
  USDT: "#34D399",   // teal
  MSOL: "#4ADE80",   // green — yield bearing
  JUP:  "#F59E0B",   // amber
  BONK: "#F87171",   // red
  WIF:  "#FB923C",   // orange
  RAY:  "#818CF8",   // indigo
  ORCA: "#2DD4BF",   // cyan
};
const DEFAULT_COLOR = "#6B7280";

// ─── Donut chart helpers ───────────────────────────────────────────────────────
const CHART_SIZE  = 140;
const OUTER_R     = 62;
const INNER_R     = 44;
const CX          = CHART_SIZE / 2;
const CY          = CHART_SIZE / 2;

function polarXY(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutSlicePath(cx, cy, outerR, innerR, startDeg, endDeg) {
  // Full circle edge case
  if (Math.abs(endDeg - startDeg) >= 359.9) {
    // Two 180° arcs
    const o1 = polarXY(cx, cy, outerR,  -90);
    const o2 = polarXY(cx, cy, outerR,   90);
    const i1 = polarXY(cx, cy, innerR,   90);
    const i2 = polarXY(cx, cy, innerR,  -90);
    return (
      `M ${o1.x} ${o1.y}` +
      ` A ${outerR} ${outerR} 0 0 1 ${o2.x} ${o2.y}` +
      ` A ${outerR} ${outerR} 0 0 1 ${o1.x} ${o1.y}` +
      ` L ${i1.x} ${i1.y}` +
      ` A ${innerR} ${innerR} 0 0 0 ${i2.x} ${i2.y}` +
      ` A ${innerR} ${innerR} 0 0 0 ${i1.x} ${i1.y} Z`
    );
  }

  const oStart = polarXY(cx, cy, outerR, startDeg);
  const oEnd   = polarXY(cx, cy, outerR, endDeg);
  const iEnd   = polarXY(cx, cy, innerR, endDeg);
  const iStart = polarXY(cx, cy, innerR, startDeg);
  const large  = endDeg - startDeg > 180 ? 1 : 0;

  return (
    `M ${oStart.x} ${oStart.y}` +
    ` A ${outerR} ${outerR} 0 ${large} 1 ${oEnd.x} ${oEnd.y}` +
    ` L ${iEnd.x} ${iEnd.y}` +
    ` A ${innerR} ${innerR} 0 ${large} 0 ${iStart.x} ${iStart.y} Z`
  );
}

function DonutChart({ breakdown, totalUsd }) {
  const entries = Object.entries(breakdown).filter(([, v]) => v.usdValue > 0);
  if (!entries.length) {
    return (
      <View style={{ width: CHART_SIZE, height: CHART_SIZE, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: TEXT_MUTED, fontSize: 12 }}>—</Text>
      </View>
    );
  }

  let cursor = 0;
  const slices = entries.map(([sym, { usdValue }]) => {
    const pct   = totalUsd > 0 ? usdValue / totalUsd : 0;
    const sweep = pct * 360;
    const start = cursor;
    cursor += sweep;
    // Small gap between slices
    return { sym, pct, startDeg: start + 1, endDeg: cursor - 1, color: TOKEN_COLORS[sym] || DEFAULT_COLOR };
  });

  return (
    <View style={{ width: CHART_SIZE, height: CHART_SIZE }}>
      <Svg width={CHART_SIZE} height={CHART_SIZE}>
        {slices.map((s) => (
          <Path
            key={s.sym}
            d={donutSlicePath(CX, CY, OUTER_R, INNER_R, s.startDeg, s.endDeg)}
            fill={s.color}
            opacity={0.9}
          />
        ))}
        {/* Center text — use a single {expr} so SVG renders one text node.
            Mixing literal $ + {expr} creates two nodes at the same position. */}
        <SvgText
          x={CX} y={CY - 6}
          textAnchor="middle"
          fill={TEXT_PRI}
          fontSize={12}
          fontWeight="800"
        >
          {`$${totalUsd < 10000 ? totalUsd.toFixed(2) : (totalUsd / 1000).toFixed(1) + "k"}`}
        </SvgText>
        <SvgText
          x={CX} y={CY + 11}
          textAnchor="middle"
          fill={TEXT_MUTED}
          fontSize={9}
          fontWeight="600"
        >
          VIRTUAL
        </SvgText>
      </Svg>
    </View>
  );
}

// ─── Line chart ───────────────────────────────────────────────────────────────
const CHART_W   = SW - 64;
const CHART_H   = 80;
const CHART_PAD = 8;

function LineChart({ snapshots, isGain }) {
  if (!snapshots || snapshots.length < 2) {
    return (
      <View style={{ height: CHART_H, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: TEXT_MUTED, fontSize: 12 }}>Swap or stake to start tracking performance</Text>
      </View>
    );
  }

  const values  = snapshots.map((s) => s.valueUsd);
  const minV    = Math.min(...values);
  const maxV    = Math.max(...values);
  const vRange  = maxV - minV || 1;
  const W       = CHART_W - CHART_PAD * 2;
  const H       = CHART_H - CHART_PAD * 2;
  const n       = snapshots.length;

  const pts = snapshots.map((s, i) => ({
    x: CHART_PAD + (i / Math.max(n - 1, 1)) * W,
    y: CHART_PAD + H - ((s.valueUsd - minV) / vRange) * H,
  }));

  const strokeColor = isGain ? "#A78BFA" : RED;
  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  // Fill path (close to bottom)
  const fillPath =
    linePath +
    ` L ${pts[pts.length - 1].x.toFixed(1)} ${(CHART_H - CHART_PAD).toFixed(1)}` +
    ` L ${pts[0].x.toFixed(1)} ${(CHART_H - CHART_PAD).toFixed(1)} Z`;

  const gradId = isGain ? "chartGainGrad" : "chartLossGrad";
  const gradColor = isGain ? "#A78BFA" : "#F87171";

  return (
    <Svg width={CHART_W} height={CHART_H}>
      <Defs>
        <SvgGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%"   stopColor={gradColor} stopOpacity="0.35" />
          <Stop offset="100%" stopColor={gradColor} stopOpacity="0.02" />
        </SvgGradient>
      </Defs>
      <Path d={fillPath}  fill={`url(#${gradId})`} />
      <Path d={linePath}  stroke={strokeColor} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* First and last dots */}
      <Circle cx={pts[0].x} cy={pts[0].y} r={3} fill={strokeColor} opacity={0.5} />
      <Circle cx={pts[n-1].x} cy={pts[n-1].y} r={4} fill={strokeColor} />
    </Svg>
  );
}

// ─── Animated count-up ────────────────────────────────────────────────────────
function AnimatedValue({ value, prefix = "$", suffix = "", style }) {
  const animVal = useRef(new Animated.Value(value)).current;
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const listener = animVal.addListener(({ value: v }) => setDisplay(v));
    Animated.timing(animVal, {
      toValue: value,
      duration: 600,
      useNativeDriver: false,
    }).start();
    return () => animVal.removeListener(listener);
  }, [value]);

  return (
    <Text style={style}>
      {prefix}{display.toFixed(2)}{suffix}
    </Text>
  );
}

// ─── History item ─────────────────────────────────────────────────────────────
const ACTION_META = {
  swap:    { icon: "⇄", label: "Swap",    color: VIOLET },
  stake:   { icon: "⬡", label: "Stake",   color: GREEN },
  unstake: { icon: "⬡", label: "Unstake", color: WARN },
  lend:    { icon: "⊕", label: "Lend",    color: "#60A5FA" },
  withdraw:{ icon: "⊖", label: "Withdraw",color: WARN },
};

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s <  60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s/60)}m`;
  return `${Math.floor(s/3600)}h`;
}

function HistoryItem({ entry, index }) {
  const slideAnim = useRef(new Animated.Value(20)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 300, delay: index * 40, useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 1, duration: 300, delay: index * 40, useNativeDriver: true }),
    ]).start();
  }, []);

  const meta = ACTION_META[entry.type] || { icon: "◎", label: entry.type, color: TEXT_SEC };

  return (
    <Animated.View
      style={[styles.historyItem, { opacity: fadeAnim, transform: [{ translateX: slideAnim }] }]}
    >
      <View style={[styles.historyIcon, { backgroundColor: meta.color + "1A", borderColor: meta.color + "33" }]}>
        <Text style={{ color: meta.color, fontSize: 14 }}>{meta.icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.historyTitle}>
          {entry.from ? `${displaySym(entry.from)} → ${displaySym(entry.to)}` : meta.label}
        </Text>
        <Text style={styles.historyDetail}>
          {entry.fromAmount?.toFixed(4)} {displaySym(entry.from)} →{" "}
          <Text style={{ color: TEXT_PRI }}>{entry.toAmount?.toFixed(4)} {displaySym(entry.to)}</Text>
        </Text>
      </View>
      <Text style={styles.historyTime}>{timeAgo(entry.timestamp)}</Text>
    </Animated.View>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function SandboxDashboard({ visible, sandboxState, onClose, onReset, walletAddress }) {
  const insets = useSafeAreaInsets();
  const [prices,    setPrices]    = useState({});
  const [loading,   setLoading]   = useState(false);
  const [slideAnim] = useState(new Animated.Value(SW));

  const refreshPrices = useCallback(async () => {
    if (!sandboxState) return;
    setLoading(true);
    const syms = Object.keys(sandboxState.balances);
    const p = await fetchTokenPricesUsd(syms);
    setPrices(p);
    setLoading(false);
  }, [sandboxState]);

  useEffect(() => {
    if (visible) {
      // Slide in
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 80, friction: 12,
        useNativeDriver: true,
      }).start();
      refreshPrices();
    } else {
      slideAnim.setValue(SW);
    }
  }, [visible]);

  const handleClose = () => {
    Animated.timing(slideAnim, { toValue: SW, duration: 220, useNativeDriver: true }).start(onClose);
  };

  const handleReset = () => {
    Alert.alert(
      "Reset Sandbox",
      "This will clear all virtual trades and restart with $200 USDC + 1 SOL. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reset", style: "destructive", onPress: onReset },
      ]
    );
  };

  if (!sandboxState) return null;

  const { totalUsd, pnlAbsolute, pnlPercent, breakdown } = calculatePnL(sandboxState, prices);
  const isGain    = pnlAbsolute >= 0;
  const pnlColor  = isGain ? GREEN : RED;
  const pnlSign   = isGain ? "+" : "-";
  const snapshots = sandboxState.performanceSnapshots || [];

  const allTokens = Object.entries(breakdown)
    .map(([sym, { balance, usdValue }]) => ({
      sym, balance, usdValue,
      pct: totalUsd > 0 ? (usdValue / totalUsd) * 100 : 0,
      color: TOKEN_COLORS[sym] || DEFAULT_COLOR,
    }))
    .sort((a, b) => b.usdValue - a.usdValue);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        {/* Tap outside to close */}
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />

        <Animated.View style={[styles.sheet, { transform: [{ translateX: slideAnim }] }]}>
          {/* ── Header ── */}
          <View style={[styles.sheetHeader, { paddingTop: insets.top + 12 }]}>
            <View style={styles.sheetTitleRow}>
              <View style={styles.sandboxBadge}>
                <Text style={styles.sandboxBadgeText}><FlaskConical size={8} color={VIOLET_LIGHT} strokeWidth={2.5} /> SANDBOX</Text>
              </View>
              <Text style={styles.sheetTitle}>Virtual Portfolio</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity style={styles.iconBtn} onPress={refreshPrices} activeOpacity={0.7}>
                {loading
                  ? <ActivityIndicator size="small" color={VIOLET} />
                  : <RefreshCw size={15} color={TEXT_SEC} strokeWidth={2} />
                }
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconBtnDestructive} onPress={handleReset} activeOpacity={0.7}>
                <RotateCcw size={15} color={RED} strokeWidth={2} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconBtn} onPress={handleClose} activeOpacity={0.7}>
                <X size={16} color={TEXT_SEC} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* ── Total Value Card ── */}
            <View style={styles.valueCard}>
              <Text style={styles.valueLabel}>TOTAL VALUE</Text>
              <AnimatedValue value={totalUsd} style={styles.valueLarge} />
              <View style={styles.pnlRow}>
                {isGain
                  ? <TrendingUp size={14} color={pnlColor} strokeWidth={2.5} />
                  : <TrendingDown size={14} color={pnlColor} strokeWidth={2.5} />
                }
                <Text style={[styles.pnlAbsolute, { color: pnlColor }]}>
                  {pnlSign}${Math.abs(pnlAbsolute).toFixed(2)}
                </Text>
                <Text style={[styles.pnlPercent, { color: pnlColor }]}>
                  ({pnlSign}{Math.abs(pnlPercent).toFixed(2)}%)
                </Text>
                <Text style={styles.pnlSince}>since start</Text>
              </View>

              {/* Performance bar */}
              <View style={styles.perfBarTrack}>
                <Animated.View
                  style={[
                    styles.perfBarFill,
                    {
                      width: `${Math.min(Math.abs(pnlPercent), 100)}%`,
                      backgroundColor: pnlColor,
                    },
                  ]}
                />
              </View>
            </View>

            {/* ── Performance Chart ── */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Performance</Text>
                <Text style={styles.sectionSub}>virtual P&L over time</Text>
              </View>
              <View style={{ paddingTop: 8, paddingBottom: 4 }}>
                <LineChart snapshots={snapshots} isGain={isGain} />
              </View>
            </View>

            {/* ── Asset Allocation ── */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Portfolio</Text>
                <Text style={styles.sectionSub}>{allTokens.length} assets</Text>
              </View>
              <View style={styles.allocationBody}>
                <DonutChart breakdown={breakdown} totalUsd={totalUsd} />
                <View style={styles.allocationList}>
                  {allTokens.map(({ sym, balance, usdValue, pct, color }) => (
                    <View key={sym} style={styles.assetRow}>
                      <View style={[styles.assetDot, { backgroundColor: color }]} />
                      <Text style={styles.assetSym}>{displaySym(sym)}</Text>
                      <View style={{ flex: 1 }}>
                        <View style={styles.assetBarTrack}>
                          <View style={[styles.assetBarFill, { width: `${pct}%`, backgroundColor: color }]} />
                        </View>
                      </View>
                      <View style={styles.assetValues}>
                        <Text style={styles.assetUsd}>${usdValue.toFixed(2)}</Text>
                        <Text style={styles.assetPct}>{pct.toFixed(1)}%</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            {/* ── History ── */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>History</Text>
                <Text style={styles.sectionSub}>{sandboxState.history?.length || 0} actions</Text>
              </View>
              {(!sandboxState.history || sandboxState.history.length === 0) ? (
                <View style={styles.emptyHistory}>
                  <ArrowRightLeft size={28} color={TEXT_MUTED} strokeWidth={1.5} />
                  <Text style={styles.emptyHistoryText}>
                    No simulated trades yet.{"\n"}Try asking Homie to swap or stake.
                  </Text>
                </View>
              ) : (
                sandboxState.history.slice(0, 20).map((e, i) => (
                  <HistoryItem key={e.id} entry={e} index={i} />
                ))
              )}
            </View>

            {/* ── Info note ── */}
            <View style={styles.noteBox}>
              <Text style={styles.noteText}>
                Sandbox uses live Jupiter prices. No real transactions are sent.{"\n"}
                Starting balance: $200 USDC + 1 SOL (for gas). Reset anytime.
              </Text>
            </View>

            <View style={{ height: 32 }} />
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  backdrop: { flex: 0.15 },
  sheet: {
    flex: 0.85,
    backgroundColor: "#060C07",
    borderLeftWidth: 1,
    borderLeftColor: VIOLET_BORDER,
  },

  // ── Sheet Header ──
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: VIOLET_BORDER,
    backgroundColor: VIOLET_DIM,
  },
  sheetTitleRow: { gap: 8 },
  sandboxBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(167,139,250,0.15)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: VIOLET_BORDER,
  },
  sandboxBadgeText: { color: VIOLET_LIGHT, fontSize: 9, fontWeight: "800", letterSpacing: 1.5 },
  sheetTitle: { color: TEXT_PRI, fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },

  iconBtn: {
    width: 32, height: 32, borderRadius: 9,
    backgroundColor: GLASS,
    borderWidth: 1, borderColor: GLASS_BORDER,
    alignItems: "center", justifyContent: "center",
  },
  iconBtnDestructive: {
    width: 32, height: 32, borderRadius: 9,
    backgroundColor: "rgba(248,113,113,0.08)",
    borderWidth: 1, borderColor: "rgba(248,113,113,0.22)",
    alignItems: "center", justifyContent: "center",
  },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },

  // ── Value Card ──
  valueCard: {
    backgroundColor: VIOLET_DIM,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: VIOLET_BORDER,
  },
  valueLabel: { color: VIOLET_LIGHT, fontSize: 10, fontWeight: "700", letterSpacing: 1.5, marginBottom: 6 },
  valueLarge: { color: TEXT_PRI, fontSize: 38, fontWeight: "800", letterSpacing: -1.5, lineHeight: 46 },
  pnlRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  pnlAbsolute: { fontSize: 15, fontWeight: "700" },
  pnlPercent:  { fontSize: 13, fontWeight: "600" },
  pnlSince:    { color: TEXT_MUTED, fontSize: 11, fontWeight: "500" },
  perfBarTrack: {
    height: 4, backgroundColor: GLASS_BORDER, borderRadius: 2, marginTop: 14, overflow: "hidden",
  },
  perfBarFill: { height: "100%", borderRadius: 2 },

  // ── Sections ──
  sectionCard: {
    backgroundColor: GLASS,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
  },
  sectionHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: { color: TEXT_PRI,  fontSize: 14, fontWeight: "800", letterSpacing: 0.3 },
  sectionSub:   { color: TEXT_MUTED, fontSize: 11, fontWeight: "500" },

  // ── Asset Allocation ──
  allocationBody: { flexDirection: "row", alignItems: "center", gap: 12 },
  allocationList: { flex: 1, gap: 9 },
  assetRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  assetDot: { width: 7, height: 7, borderRadius: 3.5 },
  assetSym: { color: TEXT_PRI, fontSize: 11, fontWeight: "700", width: 36 },
  assetBarTrack: { height: 4, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" },
  assetBarFill:  { height: "100%", borderRadius: 2, opacity: 0.85 },
  assetValues:   { alignItems: "flex-end" },
  assetUsd: { color: TEXT_PRI,  fontSize: 11, fontWeight: "700" },
  assetPct: { color: TEXT_MUTED, fontSize: 9, fontWeight: "600" },

  // ── History ──
  historyItem: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: GLASS_BORDER,
  },
  historyIcon: {
    width: 32, height: 32, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },
  historyTitle:  { color: TEXT_PRI, fontSize: 13, fontWeight: "700" },
  historyDetail: { color: TEXT_SEC, fontSize: 11, fontWeight: "500", marginTop: 2 },
  historyTime:   { color: TEXT_MUTED, fontSize: 10, fontWeight: "600" },

  emptyHistory: { alignItems: "center", paddingVertical: 24, gap: 10 },
  emptyHistoryText: { color: TEXT_MUTED, fontSize: 13, textAlign: "center", lineHeight: 20 },

  // ── Note ──
  noteBox: {
    backgroundColor: "rgba(167,139,250,0.05)",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: VIOLET_BORDER,
  },
  noteText: { color: TEXT_MUTED, fontSize: 12, lineHeight: 18 },
});
