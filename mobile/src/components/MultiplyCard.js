/**
 * MultiplyCard — Kamino Multiply position preview.
 *
 * Rendered in chat when the agent returns data with `multiply` field.
 * Shows collateral, leverage slider, live liquidation price, worst-case
 * loss scenarios, and net APY. User can adjust leverage before executing.
 */

import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, Easing, ActivityIndicator,
} from "react-native";
import * as Haptics from "expo-haptics";
import { TrendingUp, AlertTriangle, Zap, ChevronDown, ChevronUp } from "lucide-react-native";
import { F } from "../theme/fonts";

// ─── Palette ──────────────────────────────────────────────────────────────────
const GLASS       = "rgba(255,255,255,0.07)";
const GLASS_MED   = "rgba(255,255,255,0.10)";
const GLASS_BDR   = "rgba(255,255,255,0.12)";
const TEXT_PRI    = "#FFFFFF";
const TEXT_SEC    = "rgba(255,255,255,0.65)";
const TEXT_MUTED  = "rgba(255,255,255,0.35)";
const GREEN       = "#4ADE80";
const GREEN_DIM   = "rgba(74,222,128,0.55)";
const WARN        = "#FBBF24";
const RED         = "#F87171";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcLiquidationPrice(entryPrice, leverage, liquidationLtv = 0.85) {
  // Price at which LTV hits liquidation threshold
  // liqPrice = entryPrice × (1 − 1 / leverage) / liquidationLtv
  // Simplified: price drop % = (1 − liquidationLtv / ((leverage − 1) / leverage + liquidationLtv))
  if (leverage <= 1) return 0;
  const liqPrice = entryPrice * (1 - (1 / (leverage * liquidationLtv)));
  return Math.max(0, liqPrice);
}

function calcWorstCase(depositUsd, leverage, dropPct) {
  // PnL = deposit × leverage × dropPct
  const loss = depositUsd * leverage * (dropPct / 100);
  const remaining = Math.max(0, depositUsd - loss);
  return { loss, remaining, pctLoss: Math.min(100, (loss / depositUsd) * 100) };
}

function calcNetApy(collateralApy, debtApy, leverage) {
  // Net APY = Collateral Yield + (Yield Spread × (Leverage − 1))
  const spread = collateralApy - debtApy;
  return collateralApy + spread * (leverage - 1);
}

// ─── Collateral options ───────────────────────────────────────────────────────
// isCorrelated = true means SOL/LST pair → no price-based liquidation risk
const COLLATERAL_OPTIONS = [
  { symbol: "SOL",     label: "SOL",     apy: 0,   isCorrelated: false },
  { symbol: "mSOL",    label: "mSOL",    apy: 7.8, isCorrelated: true  },
  { symbol: "jitoSOL", label: "jitoSOL", apy: 8.1, isCorrelated: true  },
  { symbol: "bSOL",    label: "bSOL",    apy: 7.4, isCorrelated: true  },
];

function CollateralPicker({ value, onChange }) {
  return (
    <View style={cp.container}>
      <Text style={cp.label}>Collateral</Text>
      <View style={cp.track}>
        {COLLATERAL_OPTIONS.map((opt) => {
          const active = value === opt.symbol;
          return (
            <TouchableOpacity
              key={opt.symbol}
              style={[cp.chip, active && cp.chipActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                onChange(opt);
              }}
              activeOpacity={0.7}
            >
              <Text style={[cp.chipText, active && cp.chipTextActive]}>{opt.label}</Text>
              {opt.apy > 0 && (
                <Text style={[cp.chipApy, active && cp.chipApyActive]}>{opt.apy}%</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ─── Leverage slider steps ────────────────────────────────────────────────────
const LEVERAGE_STEPS = [1.5, 2.0, 2.5, 3.0];

function LeverageSlider({ value, onChange, maxLeverage = 3.0 }) {
  const availableSteps = LEVERAGE_STEPS.filter((s) => s <= maxLeverage);

  return (
    <View style={sl.container}>
      <Text style={sl.label}>Leverage</Text>
      <View style={sl.track}>
        {availableSteps.map((step) => {
          const active = Math.abs(value - step) < 0.01;
          return (
            <TouchableOpacity
              key={step}
              style={[sl.step, active && sl.stepActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                onChange(step);
              }}
              activeOpacity={0.7}
            >
              <Text style={[sl.stepText, active && sl.stepTextActive]}>
                {step.toFixed(1)}x
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ─── Stat row ─────────────────────────────────────────────────────────────────
function StatRow({ label, value, color = TEXT_PRI, sub }) {
  return (
    <View style={s.statRow}>
      <Text style={s.statLabel}>{label}</Text>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={[s.statValue, { color }]}>{value}</Text>
        {sub && <Text style={s.statSub}>{sub}</Text>}
      </View>
    </View>
  );
}

// ─── Worst-case scenario row ──────────────────────────────────────────────────
function ScenarioRow({ dropPct, data }) {
  const severity = dropPct >= 30 ? RED : dropPct >= 20 ? WARN : TEXT_SEC;
  return (
    <View style={s.scenarioRow}>
      <Text style={[s.scenarioLabel, { color: severity }]}>
        −{dropPct}% SOL
      </Text>
      <Text style={[s.scenarioValue, { color: data.remaining < 1 ? RED : severity }]}>
        −${data.loss.toFixed(0)} ({data.pctLoss.toFixed(0)}%)
      </Text>
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MultiplyCard({
  data,           // { collateral, collateralAmount, collateralUsd, entryPrice, collateralApy, debtApy, maxLeverage, liquidationLtv, protocol, market }
  onExecute,      // (leverage, collateral) => void — sends to agent
  executing = false,
}) {
  const initialOption = COLLATERAL_OPTIONS.find((o) => o.symbol === data.collateral) ?? COLLATERAL_OPTIONS[0];
  const [leverage, setLeverage]               = useState(data.suggestedLeverage ?? 2.0);
  const [selectedCollateral, setSelectedCollateral] = useState(initialOption);
  const [showScenarios, setShowScenarios]     = useState(false);
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeIn, {
      toValue: 1, duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, []);

  const depositUsd    = data.collateralUsd ?? 0;
  const entryPrice    = data.entryPrice ?? 0;
  const liqLtv        = data.liquidationLtv ?? 0.85;
  const maxLev        = data.maxLeverage ?? 3.0;
  const collateralApy = selectedCollateral.apy > 0 ? selectedCollateral.apy : (data.collateralApy ?? 0);
  const debtApy       = data.debtApy ?? 0;
  const isCorrelated  = selectedCollateral.isCorrelated;

  const liqPrice       = isCorrelated ? null : calcLiquidationPrice(entryPrice, leverage, liqLtv);
  const netApy         = calcNetApy(collateralApy, debtApy, leverage);
  const effectiveDeposit = depositUsd * leverage;

  const scenario10 = calcWorstCase(depositUsd, leverage, 10);
  const scenario20 = calcWorstCase(depositUsd, leverage, 20);
  const scenario30 = calcWorstCase(depositUsd, leverage, 30);

  const riskLevel = leverage >= 2.5 ? "high" : leverage >= 2.0 ? "medium" : "low";
  const riskColor = riskLevel === "high" ? RED : riskLevel === "medium" ? WARN : GREEN;

  return (
    <Animated.View style={[s.card, { opacity: fadeIn, transform: [{ translateY: fadeIn.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>

      {/* ── Header ── */}
      <View style={s.header}>
        <View style={s.headerIcon}>
          <Zap size={16} color={GREEN_DIM} strokeWidth={2.5} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Kamino Multiply</Text>
          <Text style={s.headerSub}>{selectedCollateral.symbol}-SOL · {data.protocol ?? "Kamino"}</Text>
        </View>
        <View style={[s.riskBadge, { borderColor: riskColor }]}>
          <View style={[s.riskDot, { backgroundColor: riskColor }]} />
          <Text style={[s.riskText, { color: riskColor }]}>{riskLevel}</Text>
        </View>
      </View>

      {/* ── Collateral picker ── */}
      <CollateralPicker value={selectedCollateral.symbol} onChange={setSelectedCollateral} />

      {/* ── Amount row ── */}
      <View style={s.collateralBox}>
        <View style={s.collateralRow}>
          <Text style={s.collateralLabel}>Amount</Text>
          <Text style={s.collateralValue}>
            {data.collateralAmount ?? "—"} {selectedCollateral.symbol}
          </Text>
        </View>
        <View style={s.collateralRow}>
          <Text style={s.collateralLabel}>Value</Text>
          <Text style={s.collateralValue}>${depositUsd.toFixed(2)}</Text>
        </View>
      </View>

      {/* ── Leverage selector ── */}
      <LeverageSlider value={leverage} onChange={setLeverage} maxLeverage={maxLev} />

      {/* ── Key stats ── */}
      <View style={s.statsBox}>
        <StatRow
          label="Effective exposure"
          value={`$${effectiveDeposit.toFixed(0)}`}
          sub={`${leverage.toFixed(1)}× your deposit`}
        />
        <StatRow
          label="Net APY"
          value={`${netApy.toFixed(1)}%`}
          color={netApy > 0 ? GREEN : RED}
          sub={`${collateralApy.toFixed(1)}% yield + ${((collateralApy - debtApy) * (leverage - 1)).toFixed(1)}% spread`}
        />
        {liqPrice != null && (
          <StatRow
            label="Liquidation price"
            value={`$${liqPrice.toFixed(2)}`}
            color={liqPrice > entryPrice * 0.7 ? RED : WARN}
            sub={`Current: $${entryPrice.toFixed(2)}`}
          />
        )}
        {isCorrelated && (
          <StatRow
            label="Liquidation risk"
            value="Minimal"
            color={GREEN}
            sub="Correlated pair — stake-rate oracle"
          />
        )}
      </View>

      {/* ── Worst-case scenarios (collapsible) ── */}
      <TouchableOpacity
        style={s.scenarioToggle}
        onPress={() => setShowScenarios((v) => !v)}
        activeOpacity={0.7}
      >
        <AlertTriangle size={13} color={WARN} strokeWidth={2} />
        <Text style={s.scenarioToggleText}>
          {showScenarios ? "Hide risk scenarios" : "Show worst-case scenarios"}
        </Text>
        {showScenarios
          ? <ChevronUp size={14} color={TEXT_MUTED} strokeWidth={2} />
          : <ChevronDown size={14} color={TEXT_MUTED} strokeWidth={2} />
        }
      </TouchableOpacity>

      {showScenarios && (
        <View style={s.scenarioBox}>
          <Text style={s.scenarioTitle}>If SOL drops…</Text>
          <ScenarioRow dropPct={10} data={scenario10} />
          <ScenarioRow dropPct={20} data={scenario20} />
          <ScenarioRow dropPct={30} data={scenario30} />
          {scenario30.remaining < 1 && (
            <View style={s.warnBanner}>
              <Text style={s.warnBannerText}>
                At 3x leverage, a 30%+ drop could wipe your position.
              </Text>
            </View>
          )}
        </View>
      )}

      {/* ── Execute button ── */}
      <TouchableOpacity
        style={[s.executeBtn, executing && s.executeBtnDisabled]}
        onPress={() => onExecute?.(leverage, selectedCollateral.symbol)}
        activeOpacity={0.85}
        disabled={executing}
      >
        {executing ? (
          <ActivityIndicator size={16} color="#000" />
        ) : (
          <>
            <Zap size={15} color="#000" strokeWidth={2.5} />
            <Text style={s.executeBtnText}>
              Open {leverage.toFixed(1)}x {selectedCollateral.symbol} Multiply
            </Text>
          </>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Collateral Picker Styles ─────────────────────────────────────────────────
const cp = StyleSheet.create({
  container: { marginBottom: 14 },
  label: {
    color: TEXT_MUTED, fontSize: 11, fontFamily: F.medium,
    letterSpacing: 0.5, marginBottom: 8, textTransform: "uppercase",
  },
  track: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: {
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10,
    backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_BDR,
    alignItems: "center",
  },
  chipActive: {
    backgroundColor: "rgba(74,222,128,0.10)",
    borderColor: "rgba(74,222,128,0.35)",
  },
  chipText: { color: TEXT_SEC, fontSize: 13, fontFamily: F.headSemi },
  chipTextActive: { color: GREEN },
  chipApy: { color: TEXT_MUTED, fontSize: 10, fontFamily: F.regular, marginTop: 1 },
  chipApyActive: { color: GREEN_DIM },
});

// ─── Leverage Slider Styles ───────────────────────────────────────────────────
const sl = StyleSheet.create({
  container: { marginBottom: 16 },
  label: {
    color: TEXT_MUTED, fontSize: 11, fontFamily: F.medium,
    letterSpacing: 0.5, marginBottom: 8, textTransform: "uppercase",
  },
  track: {
    flexDirection: "row", gap: 8,
  },
  step: {
    flex: 1, alignItems: "center",
    paddingVertical: 10, borderRadius: 12,
    backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_BDR,
  },
  stepActive: {
    backgroundColor: "rgba(74,222,128,0.12)",
    borderColor: "rgba(74,222,128,0.35)",
  },
  stepText: {
    color: TEXT_SEC, fontSize: 15, fontFamily: F.headBold,
  },
  stepTextActive: {
    color: GREEN,
  },
});

// ─── Card Styles ──────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  card: {
    backgroundColor: GLASS, borderRadius: 20,
    padding: 18, marginTop: 10,
    borderWidth: 1, borderColor: GLASS_BDR,
  },

  // Header
  header: {
    flexDirection: "row", alignItems: "center",
    gap: 12, marginBottom: 16,
  },
  headerIcon: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: "rgba(74,222,128,0.10)",
    borderWidth: 1, borderColor: "rgba(74,222,128,0.22)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: {
    color: TEXT_PRI, fontSize: 16, fontFamily: F.headBold,
    letterSpacing: 0.3,
  },
  headerSub: {
    color: TEXT_MUTED, fontSize: 12, fontFamily: F.regular, marginTop: 1,
  },
  riskBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1,
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  riskDot: { width: 6, height: 6, borderRadius: 3 },
  riskText: { fontSize: 11, fontFamily: F.headSemi, letterSpacing: 0.3 },

  // Collateral
  collateralBox: {
    backgroundColor: GLASS_MED, borderRadius: 14,
    borderWidth: 1, borderColor: GLASS_BDR,
    padding: 14, marginBottom: 16, gap: 8,
  },
  collateralRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  collateralLabel: {
    color: TEXT_MUTED, fontSize: 12, fontFamily: F.medium,
  },
  collateralValue: {
    color: TEXT_PRI, fontSize: 14, fontFamily: F.headSemi,
  },

  // Stats
  statsBox: {
    borderRadius: 14, borderWidth: 1, borderColor: GLASS_BDR,
    overflow: "hidden", marginBottom: 14,
  },
  statRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 12, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: GLASS_BDR,
  },
  statLabel: { color: TEXT_MUTED, fontSize: 12, fontFamily: F.medium },
  statValue: { color: TEXT_PRI, fontSize: 14, fontFamily: F.headBold },
  statSub: { color: TEXT_MUTED, fontSize: 10, fontFamily: F.regular, marginTop: 1 },

  // Scenarios
  scenarioToggle: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "flex-start",
    paddingVertical: 8, paddingHorizontal: 12,
    backgroundColor: "rgba(251,191,36,0.06)",
    borderRadius: 10, borderWidth: 1, borderColor: "rgba(251,191,36,0.15)",
    marginBottom: 12,
  },
  scenarioToggleText: {
    color: WARN, fontSize: 12, fontFamily: F.medium, flex: 1,
  },
  scenarioBox: {
    backgroundColor: "rgba(0,0,0,0.25)", borderRadius: 14,
    borderWidth: 1, borderColor: GLASS_BDR,
    padding: 14, marginBottom: 14, gap: 8,
  },
  scenarioTitle: {
    color: TEXT_SEC, fontSize: 12, fontFamily: F.semibold,
    letterSpacing: 0.3, marginBottom: 4,
  },
  scenarioRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  scenarioLabel: { fontSize: 13, fontFamily: F.medium },
  scenarioValue: { fontSize: 13, fontFamily: F.headSemi },

  warnBanner: {
    backgroundColor: "rgba(248,113,113,0.08)",
    borderRadius: 10, padding: 10, marginTop: 4,
    borderWidth: 1, borderColor: "rgba(248,113,113,0.20)",
  },
  warnBannerText: {
    color: RED, fontSize: 11, fontFamily: F.regular, lineHeight: 16,
  },

  // Execute
  executeBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: GREEN, borderRadius: 14,
    paddingVertical: 14, marginTop: 2,
  },
  executeBtnDisabled: { opacity: 0.5 },
  executeBtnText: {
    color: "#000", fontSize: 15, fontFamily: F.headBold, letterSpacing: 0.3,
  },
});
