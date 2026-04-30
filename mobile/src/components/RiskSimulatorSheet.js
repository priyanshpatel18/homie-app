import React, { useState, useMemo } from "react";
import {
  View, Text, Modal, TouchableOpacity, StyleSheet, ScrollView,
} from "react-native";
import { Skull, TrendingDown, ChevronDown, ChevronUp, TrendingUp, Rocket } from "lucide-react-native";
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, Easing,
} from "react-native-reanimated";

const GLASS       = "rgba(255,255,255,0.07)";
const GLASS_MED   = "rgba(255,255,255,0.10)";
const GLASS_BDR   = "rgba(255,255,255,0.12)";
const GLASS_BDR_L = "rgba(255,255,255,0.18)";
const TEXT_PRI    = "#FFFFFF";
const TEXT_SEC    = "rgba(255,255,255,0.65)";
const TEXT_MUTED  = "rgba(255,255,255,0.35)";
const GREEN       = "#4ADE80";
const RED         = "#F87171";
const YELLOW      = "#FBBF24";
const PURPLE      = "#A78BFA";

const SCENARIOS = [
  { id: "crash_50",  label: "Market crash",    sub: "SOL −50%",  solMult: 0.50, otherMult: 0.60, icon: "skull" },
  { id: "dip_30",    label: "Bear dip",         sub: "SOL −30%",  solMult: 0.70, otherMult: 0.80, icon: "trendDown" },
  { id: "dip_20",    label: "Soft correction",  sub: "SOL −20%",  solMult: 0.80, otherMult: 0.88, icon: "chevDown" },
  { id: "pump_20",   label: "Local rally",      sub: "SOL +20%",  solMult: 1.20, otherMult: 1.10, icon: "chevUp" },
  { id: "pump_50",   label: "Bull run",         sub: "SOL +50%",  solMult: 1.50, otherMult: 1.28, icon: "trendUp" },
  { id: "moon_100",  label: "SOL season",       sub: "SOL +100%", solMult: 2.00, otherMult: 1.55, icon: "rocket" },
];

const SOL_LIKE = new Set([
  "So11111111111111111111111111111111111111112",
  "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
]);
const STABLE_LIKE = new Set([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
]);

function fmtUsd(v) {
  if (v == null || isNaN(v)) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 10_000)    return `$${(v / 1_000).toFixed(1)}k`;
  return `$${v.toFixed(2)}`;
}

// ─── Risk score engine ────────────────────────────────────────────────────────
function calcRiskScore(rows, portfolio) {
  if (!rows.length) return { level: "Unknown", color: TEXT_MUTED, score: 0, reason: "No portfolio data" };

  const total = rows.reduce((s, r) => s + r.cur, 0);
  if (total < 1) return { level: "Low", color: GREEN, score: 1, reason: "Portfolio is too small to meaningfully assess" };

  const solPct     = rows.filter(r => r.type === "sol" || r.type === "staked")
                         .reduce((s, r) => s + r.cur, 0) / total;
  const stablePct  = rows.filter(r => r.type === "stable").reduce((s, r) => s + r.cur, 0) / total;
  const lendingPct = rows.filter(r => r.type === "lending").reduce((s, r) => s + r.cur, 0) / total;
  const hasLp      = rows.some(r => r.type === "lp");

  let score = 0;
  if (solPct > 0.80) score += 3;
  else if (solPct > 0.60) score += 2;
  else if (solPct > 0.40) score += 1;

  if (lendingPct > 0.30) score += 1; // lending has liquidation risk
  if (hasLp) score += 1;             // LP has impermanent loss risk
  if (stablePct > 0.40) score -= 1;  // stables reduce risk

  let level, color, reason;
  if (score <= 1) {
    level = "Low"; color = GREEN;
    reason = stablePct > 0.3
      ? `${(stablePct * 100).toFixed(0)}% of your portfolio is in stablecoins — well-protected`
      : "Good diversification across asset types";
  } else if (score <= 3) {
    level = "Medium"; color = YELLOW;
    if (lendingPct > 0.2)
      reason = `${(lendingPct * 100).toFixed(0)}% in lending — watch liquidation thresholds in a bear market`;
    else if (hasLp)
      reason = "LP positions carry impermanent loss risk during volatility";
    else
      reason = `${(solPct * 100).toFixed(0)}% of your value moves with SOL price`;
  } else {
    level = "High"; color = RED;
    reason = `${(solPct * 100).toFixed(0)}% concentrated in SOL — heavily exposed to price swings`;
  }

  return { level, color, score, reason, solPct, stablePct, lendingPct, hasLp };
}

// ─── Homie advice engine ──────────────────────────────────────────────────────
function getHomieAdvice(riskData, scenario, delta, currentTotal) {
  if (!riskData || !currentTotal) return null;
  const { level, solPct, stablePct, lendingPct, hasLp } = riskData;
  const isBear = scenario.solMult < 1;
  const lossAmt = fmtUsd(Math.abs(delta));

  if (isBear) {
    if (level === "High")
      return `Your portfolio is ${(solPct * 100).toFixed(0)}% SOL. In this scenario you'd lose ${lossAmt} — that's a real hit. Moving even 30% into stable yields on Kamino (8–12% APY) would cut your downside significantly.`;
    if (level === "Medium" && lendingPct > 0.2)
      return `With ${(lendingPct * 100).toFixed(0)}% in lending, watch your health factor — if SOL drops this much, you could be at liquidation risk. Consider withdrawing some collateral now.`;
    if (level === "Medium" && hasLp)
      return `LP positions suffer double in a bear: price drops AND impermanent loss. If you're not collecting fees actively, consider removing liquidity until the market stabilizes.`;
    if (level === "Low")
      return `You're well-protected here. Your stables hold value and your staked SOL keeps earning yield even through the dip — that's exactly how you're supposed to be positioned.`;
  } else {
    if (level === "High")
      return `Great upside in this scenario — but this only works if you also handle the downside. Consider locking in some profits into stable yield to protect gains long-term.`;
    if (stablePct > 0.5)
      return `Heavy stablecoin position means you'll miss out on some of this rally. If you believe in SOL, putting a portion into Marinade staking gives you upside exposure with yield.`;
    return `Good position to capture upside. Your staked SOL earns yield on top of price appreciation — that's compounding working for you.`;
  }
  return null;
}

// ─── Learning insight ─────────────────────────────────────────────────────────
function getLearningInsight(scenario, riskData) {
  const isBear = scenario.solMult < 1;
  if (!riskData) return null;
  const { level, hasLp, lendingPct } = riskData;

  if (hasLp && isBear)
    return { label: "Impermanent Loss", text: "When token prices diverge, LP positions lose value vs just holding. The more the price moves, the bigger the loss — even if you earned fees." };
  if (lendingPct > 0.2 && isBear)
    return { label: "Liquidation Risk", text: "Lending protocols use a health factor. If your collateral value drops too low, the protocol auto-sells your collateral to repay the loan — often at the worst price." };
  if (level === "High" && isBear)
    return { label: "Concentration Risk", text: "Holding most of your value in a single volatile asset amplifies losses. Spreading across stablecoins and yield-bearing assets smooths out volatility." };
  if (!isBear)
    return { label: "Yield on Top of Price", text: "When you stake or lend, you earn APY on top of any price appreciation. In a bull market, this compounds quickly — price up 50% + 7% APY = 57%+ total return." };
  return { label: "Diversification", text: "Not all assets move together. Stablecoins hold flat, staked assets earn yield, and correlated tokens like mSOL move with SOL. Mixing all three reduces your overall risk." };
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function ScenarioButton({ scenario, selected, onPress }) {
  const isUp = scenario.solMult >= 1;
  const color = isUp ? GREEN : RED;
  const ICON_MAP = {
    skull:     <Skull size={15} color={selected ? TEXT_PRI : TEXT_SEC} strokeWidth={1.8} />,
    trendDown: <TrendingDown size={15} color={selected ? TEXT_PRI : TEXT_SEC} strokeWidth={1.8} />,
    chevDown:  <ChevronDown size={15} color={selected ? TEXT_PRI : TEXT_SEC} strokeWidth={1.8} />,
    chevUp:    <ChevronUp size={15} color={selected ? TEXT_PRI : TEXT_SEC} strokeWidth={1.8} />,
    trendUp:   <TrendingUp size={15} color={selected ? TEXT_PRI : TEXT_SEC} strokeWidth={1.8} />,
    rocket:    <Rocket size={15} color={selected ? TEXT_PRI : TEXT_SEC} strokeWidth={1.8} />,
  };
  return (
    <TouchableOpacity
      style={[styles.scenBtn, selected && { borderColor: color, backgroundColor: `${color}18` }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {ICON_MAP[scenario.icon]}
      <Text style={[styles.scenLabel, selected && { color: TEXT_PRI }]}>{scenario.label}</Text>
      <Text style={[styles.scenSub, { color }]}>{scenario.sub}</Text>
    </TouchableOpacity>
  );
}

function RiskBadge({ level, color, reason }) {
  const bullets = { Low: 1, Medium: 2, High: 3, Unknown: 0 };
  const filled  = bullets[level] ?? 0;
  return (
    <View style={[styles.riskCard, { borderColor: `${color}30` }]}>
      <View style={styles.riskTop}>
        <View>
          <Text style={styles.riskTitle}>Portfolio Risk</Text>
          <Text style={[styles.riskLevel, { color }]}>{level}</Text>
        </View>
        <View style={styles.riskDots}>
          {[1, 2, 3].map((i) => (
            <View key={i} style={[styles.riskDot, { backgroundColor: i <= filled ? color : "rgba(255,255,255,0.12)" }]} />
          ))}
        </View>
      </View>
      <Text style={styles.riskReason}>{reason}</Text>
    </View>
  );
}

function ImpactBar({ current, simulated }) {
  const pct = current > 0 ? Math.min(Math.abs(simulated - current) / current, 1) : 0;
  const isUp = simulated >= current;
  const color = isUp ? GREEN : RED;
  const barW = useSharedValue(0);
  React.useEffect(() => {
    barW.value = withTiming(pct, { duration: 420, easing: Easing.out(Easing.cubic) });
  }, [pct]);
  const barStyle = useAnimatedStyle(() => ({ width: `${barW.value * 100}%`, backgroundColor: color }));
  return (
    <View style={styles.barTrack}>
      <Animated.View style={[styles.barFill, barStyle]} />
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function RiskSimulatorSheet({ visible, portfolio, solBalance, onClose }) {
  const [selectedId, setSelectedId] = useState("dip_30");
  const scenario = SCENARIOS.find((s) => s.id === selectedId) ?? SCENARIOS[1];

  const { currentTotal, simulatedTotal, breakdown, riskData } = useMemo(() => {
    const rows = [];
    let curTotal = 0;
    let simTotal = 0;

    // Native SOL
    if (solBalance > 0 && portfolio?.solPrice) {
      const cur = solBalance * portfolio.solPrice;
      rows.push({ label: "SOL", sub: `${solBalance.toFixed(3)} SOL`, cur, sim: cur * scenario.solMult, type: "sol" });
      curTotal += cur; simTotal += cur * scenario.solMult;
    }

    // SPL tokens
    for (const tok of (portfolio?.tokens ?? [])) {
      if (!tok.usdValue || tok.usdValue < 0.5) continue;
      let mult, type;
      if (STABLE_LIKE.has(tok.mint))      { mult = 1.0;                  type = "stable"; }
      else if (SOL_LIKE.has(tok.mint))    { mult = scenario.solMult;     type = "staked"; }
      else                                 { mult = scenario.otherMult;   type = "token";  }
      const cur = tok.usdValue;
      rows.push({ label: tok.symbol ?? tok.mint.slice(0, 4), sub: "token", cur, sim: cur * mult, type });
      curTotal += cur; simTotal += cur * mult;
    }

    // Marinade / liquid staking positions
    for (const pos of (portfolio?.positions ?? [])) {
      if (pos.type === "liquid_stake" && pos.msolBalance > 0) {
        const price = portfolio.solPrice ?? 0;
        const cur = pos.msolBalance * price;
        if (cur < 0.5) continue;
        rows.push({ label: "mSOL", sub: `${pos.msolBalance.toFixed(3)} staked`, cur, sim: cur * scenario.solMult, type: "staked" });
        curTotal += cur; simTotal += cur * scenario.solMult;
      }
      if (pos.type === "lending") {
        for (const dep of (pos.deposits ?? [])) {
          if ((dep.usdValue ?? 0) < 0.5) continue;
          const mult = STABLE_LIKE.has(dep.mint) ? 1.0 : scenario.solMult;
          rows.push({ label: `${dep.symbol} (lend)`, sub: `Kamino`, cur: dep.usdValue, sim: dep.usdValue * mult, type: "lending" });
          curTotal += dep.usdValue; simTotal += dep.usdValue * mult;
        }
      }
      if (pos.type === "lp") {
        const cur = pos.usdValue ?? 0;
        if (cur < 0.5) continue;
        rows.push({ label: pos.pair ?? "LP", sub: pos.protocol ?? "LP position", cur, sim: cur * scenario.otherMult, type: "lp" });
        curTotal += cur; simTotal += cur * scenario.otherMult;
      }
    }

    const riskData = rows.length > 0 ? calcRiskScore(rows, portfolio) : null;
    return { currentTotal: curTotal, simulatedTotal: simTotal, breakdown: rows, riskData };
  }, [selectedId, portfolio, solBalance]);

  const delta      = simulatedTotal - currentTotal;
  const deltaPct   = currentTotal > 0 ? (delta / currentTotal) * 100 : 0;
  const deltaColor = delta >= 0 ? GREEN : RED;
  const isBear     = scenario.solMult < 1;

  const homieAdvice   = getHomieAdvice(riskData, scenario, delta, currentTotal);
  const learningHint  = getLearningInsight(scenario, riskData);

  const typeLabel = { sol: "Native SOL", staked: "Staked", stable: "Stablecoin", token: "Token", lending: "Lending", lp: "LP" };
  const typeColor = { sol: TEXT_SEC, staked: "#34D399", stable: "#60A5FA", token: TEXT_SEC, lending: YELLOW, lp: PURPLE };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>

          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Risk Check</Text>
              <Text style={styles.subtitle}>see what happens to YOUR money</Text>
            </View>
            <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.divider} />

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

            {/* Risk score badge */}
            {riskData && (
              <RiskBadge level={riskData.level} color={riskData.color} reason={riskData.reason} />
            )}

            {/* Scenario selector */}
            <View style={styles.scenGrid}>
              {SCENARIOS.map((s) => (
                <ScenarioButton key={s.id} scenario={s} selected={s.id === selectedId} onPress={() => setSelectedId(s.id)} />
              ))}
            </View>

            {/* Personalized impact hero */}
            {currentTotal > 0 && (
              <View style={styles.impactCard}>
                <Text style={styles.impactScenLabel}>In the "{scenario.label}" scenario</Text>
                <View style={styles.impactHero}>
                  <View style={styles.impactCol}>
                    <Text style={styles.impactSubLabel}>Your portfolio now</Text>
                    <Text style={styles.impactValue}>{fmtUsd(currentTotal)}</Text>
                  </View>
                  <Text style={styles.impactArrow}>→</Text>
                  <View style={styles.impactCol}>
                    <Text style={styles.impactSubLabel}>Would become</Text>
                    <Text style={[styles.impactValue, { color: deltaColor }]}>{fmtUsd(simulatedTotal)}</Text>
                  </View>
                </View>
                <View style={styles.impactDeltaRow}>
                  <Text style={[styles.impactDelta, { color: deltaColor }]}>
                    {delta >= 0 ? "+" : ""}{fmtUsd(delta)}  ({deltaPct >= 0 ? "+" : ""}{deltaPct.toFixed(1)}%)
                  </Text>
                </View>
                <ImpactBar current={currentTotal} simulated={simulatedTotal} />
              </View>
            )}

            {/* Position breakdown */}
            {breakdown.length > 0 && (
              <View style={styles.breakdownCard}>
                <Text style={styles.sectionLabel}>YOUR POSITIONS</Text>
                {breakdown.map((row, i) => {
                  const rowDelta = row.sim - row.cur;
                  const rowColor = rowDelta >= 0 ? GREEN : (rowDelta === 0 ? TEXT_MUTED : RED);
                  return (
                    <View key={i} style={styles.breakdownRow}>
                      <View style={styles.breakdownLeft}>
                        <Text style={styles.breakdownSym}>{row.label}</Text>
                        <Text style={[styles.breakdownType, { color: typeColor[row.type] ?? TEXT_MUTED }]}>
                          {typeLabel[row.type] ?? row.type}
                        </Text>
                      </View>
                      <View style={styles.breakdownRight}>
                        <Text style={styles.breakdownCur}>{fmtUsd(row.cur)}</Text>
                        <Text style={[styles.breakdownDelta, { color: rowColor }]}>
                          {rowDelta === 0 ? "flat" : `${rowDelta >= 0 ? "+" : ""}${fmtUsd(rowDelta)}`}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Homie advice */}
            {homieAdvice && (
              <View style={[styles.adviceCard, { borderColor: isBear ? `${RED}25` : `${GREEN}25` }]}>
                <View style={styles.adviceHeader}>
                  <View style={[styles.adviceDot, { backgroundColor: isBear ? RED : GREEN }]} />
                  <Text style={[styles.adviceTitle, { color: isBear ? RED : GREEN }]}>
                    Homie's take
                  </Text>
                </View>
                <Text style={styles.adviceText}>{homieAdvice}</Text>
              </View>
            )}

            {/* Learning insight */}
            {learningHint && (
              <View style={styles.learnCard}>
                <View style={styles.learnHeader}>
                  <Text style={styles.learnIcon}>i</Text>
                  <Text style={styles.learnTitle}>Why this matters: {learningHint.label}</Text>
                </View>
                <Text style={styles.learnText}>{learningHint.text}</Text>
              </View>
            )}

            {breakdown.length === 0 && (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>
                  Connect your wallet and load your portfolio{"\n"}to get a personalized risk check.
                </Text>
              </View>
            )}

            <Text style={styles.disclaimerText}>
              Simulations use rough correlation multipliers. Not financial advice. Stablecoins held flat.
            </Text>

          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#111",
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    maxHeight: "88%",
    borderWidth: 1, borderColor: GLASS_BDR_L, borderBottomWidth: 0,
  },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16,
  },
  title:    { color: TEXT_PRI, fontSize: 20, fontWeight: "800" },
  subtitle: { color: TEXT_MUTED, fontSize: 13, marginTop: 3 },
  doneBtn: {
    backgroundColor: GLASS_MED, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 9,
    borderWidth: 1, borderColor: GLASS_BDR,
  },
  doneBtnText: { color: TEXT_SEC, fontSize: 14, fontWeight: "700" },
  divider: { height: 1, backgroundColor: GLASS_BDR, marginHorizontal: 24 },
  scroll: { padding: 16, gap: 12, paddingBottom: 44 },

  // ── Risk badge ──
  riskCard: {
    backgroundColor: GLASS,
    borderRadius: 18, padding: 16,
    borderWidth: 1, gap: 8,
  },
  riskTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  riskTitle: { color: TEXT_MUTED, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  riskLevel: { fontSize: 22, fontWeight: "900", marginTop: 2 },
  riskDots: { flexDirection: "row", gap: 6 },
  riskDot: { width: 12, height: 12, borderRadius: 6 },
  riskReason: { color: TEXT_SEC, fontSize: 13, lineHeight: 20 },

  // ── Scenario grid ──
  scenGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  scenBtn: {
    width: "30%", flexGrow: 1,
    backgroundColor: GLASS, borderRadius: 14,
    padding: 11, borderWidth: 1, borderColor: GLASS_BDR,
    alignItems: "center", gap: 3,
  },
  scenLabel: { color: TEXT_SEC, fontSize: 11, fontWeight: "700", textAlign: "center" },
  scenSub:   { fontSize: 11, fontWeight: "800", textAlign: "center" },

  // ── Impact hero ──
  impactCard: {
    backgroundColor: GLASS, borderRadius: 18,
    padding: 18, borderWidth: 1, borderColor: GLASS_BDR, gap: 10,
  },
  impactScenLabel: { color: TEXT_MUTED, fontSize: 12, fontWeight: "600" },
  impactHero: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  impactCol: { flex: 1, gap: 3 },
  impactSubLabel: { color: TEXT_MUTED, fontSize: 11, fontWeight: "600" },
  impactValue: { color: TEXT_PRI, fontSize: 26, fontWeight: "800" },
  impactArrow: { color: TEXT_MUTED, fontSize: 20, paddingHorizontal: 10 },
  impactDeltaRow: { flexDirection: "row" },
  impactDelta: { fontSize: 15, fontWeight: "800" },

  barTrack: { height: 4, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" },
  barFill: { height: 4, borderRadius: 2 },

  // ── Breakdown ──
  breakdownCard: {
    backgroundColor: GLASS, borderRadius: 18,
    padding: 16, borderWidth: 1, borderColor: GLASS_BDR, gap: 2,
  },
  sectionLabel: { color: TEXT_MUTED, fontSize: 11, fontWeight: "700", letterSpacing: 0.8, marginBottom: 6 },
  breakdownRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)",
  },
  breakdownLeft: { gap: 2 },
  breakdownSym: { color: TEXT_PRI, fontSize: 14, fontWeight: "700" },
  breakdownType: { fontSize: 11, fontWeight: "600" },
  breakdownRight: { flexDirection: "row", gap: 14, alignItems: "center" },
  breakdownCur: { color: TEXT_MUTED, fontSize: 13 },
  breakdownDelta: { fontSize: 13, fontWeight: "700", minWidth: 56, textAlign: "right" },

  // ── Homie advice ──
  adviceCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 16, padding: 16,
    borderWidth: 1, gap: 8,
  },
  adviceHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  adviceDot: { width: 8, height: 8, borderRadius: 4 },
  adviceTitle: { fontSize: 12, fontWeight: "800", letterSpacing: 0.3 },
  adviceText: { color: TEXT_SEC, fontSize: 14, lineHeight: 22 },

  // ── Learning insight ──
  learnCard: {
    backgroundColor: "rgba(74,222,128,0.05)",
    borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: "rgba(74,222,128,0.14)", gap: 8,
  },
  learnHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  learnIcon: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: "rgba(74,222,128,0.18)",
    color: GREEN, fontSize: 11, fontWeight: "900",
    textAlign: "center", lineHeight: 20,
  },
  learnTitle: { color: GREEN, fontSize: 12, fontWeight: "800", flex: 1 },
  learnText: { color: TEXT_SEC, fontSize: 13, lineHeight: 21 },

  // ── Empty / footer ──
  empty: { paddingVertical: 40, alignItems: "center" },
  emptyText: { color: TEXT_MUTED, fontSize: 14, textAlign: "center", lineHeight: 22 },
  disclaimerText: { color: TEXT_MUTED, fontSize: 11, lineHeight: 17, textAlign: "center", paddingTop: 4 },
});
