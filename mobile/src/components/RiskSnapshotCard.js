/**
 * RiskSnapshotCard — inline chat risk simulation card.
 * Rendered directly in the message thread. No sheets, no navigation.
 * Premium Skia bar charts + beta-aware simulation + hedge CTA.
 */

import React, { useMemo, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import {
  Canvas, Rect, Group, LinearGradient, vec,
} from "@shopify/react-native-skia";
import {
  useSharedValue, withTiming, Easing,
} from "react-native-reanimated";
import { F } from "../theme/fonts";
import * as Haptics from "expo-haptics";
import { TrendingDown, TrendingUp, Shield, Zap } from "lucide-react-native";

// ─── Beta table: how much each token moves vs SOL ────────────────────────────
const TOKEN_BETA = {
  "So11111111111111111111111111111111111111112":  1.00, // SOL
  "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So": 1.00, // mSOL
  "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn": 1.00, // JitoSOL
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": 0.00, // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": 0.00, // USDT
  "USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA":  0.00, // USDS
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN":  0.70, // JUP
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": 0.72, // RAY
  "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE":  0.68, // ORCA
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": 1.45, // BONK
  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm": 1.40, // WIF
  "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr": 1.55, // POPCAT
  "HZ1JovNiVvGrk4ij9SwE6FDUDY8cMfW4Bw4UNkNkB27W": 0.85, // PYTH
  "SHDWyBxihqiCj6YekG2GUr7wqKLeLAQLcqKF3zzvmss":  0.80, // SHDW
  "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1":  1.00, // bSOL
};
const DEFAULT_BETA = 0.85;

// ─── Colour helpers ───────────────────────────────────────────────────────────
const GREEN  = "#4ADE80";
const RED    = "#F87171";
const AMBER  = "#FBBF24";
const ORANGE = "#FB923C";
const BLUE   = "#60A5FA";

function deltaColor(movePct) {
  if (movePct >=  0) return GREEN;
  if (movePct >= -15) return AMBER;
  if (movePct >= -35) return ORANGE;
  return RED;
}

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmtUsd(v, showSign = false) {
  if (v == null || isNaN(v)) return "—";
  const abs = Math.abs(v);
  const sign = showSign ? (v > 0 ? "+" : v < 0 ? "−" : "") : "";
  const prefix = v < 0 && !showSign ? "−" : "";
  if (abs >= 1_000_000) return `${prefix}${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 10_000)    return `${prefix}${sign}$${(abs / 1e3).toFixed(1)}k`;
  return `${prefix}${sign}$${abs.toFixed(2)}`;
}
function fmtPct(v) {
  if (v == null || isNaN(v)) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}

// ─── Simulation engine ────────────────────────────────────────────────────────
function simulate(portfolio, solBalance, solMovePct) {
  const move = solMovePct / 100;
  const solPrice = portfolio?.solPrice ?? 0;
  const rows = [];

  if (solBalance > 0 && solPrice > 0) {
    const cur = solBalance * solPrice;
    rows.push({ label: "SOL", sub: `${solBalance.toFixed(3)} SOL`, mint: "So11111111111111111111111111111111111111112", beta: 1.0, cur, sim: cur * (1 + move * 1.0), type: "sol" });
  }

  for (const tok of (portfolio?.tokens ?? [])) {
    if (!tok.usdValue || tok.usdValue < 0.5) continue;
    const beta = TOKEN_BETA[tok.mint] ?? DEFAULT_BETA;
    const cur  = tok.usdValue;
    rows.push({ label: tok.symbol ?? tok.mint.slice(0, 4), sub: "token", mint: tok.mint, beta, cur, sim: cur * (1 + move * beta), type: beta === 0 ? "stable" : beta >= 1.2 ? "meme" : "token" });
  }

  for (const pos of (portfolio?.positions ?? [])) {
    if (pos.type === "liquid_stake" && pos.msolBalance > 0) {
      const cur = pos.msolBalance * solPrice;
      if (cur < 0.5) continue;
      rows.push({ label: "mSOL", sub: `${pos.msolBalance.toFixed(3)} staked`, mint: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So", beta: 1.0, cur, sim: cur * (1 + move * 1.0), type: "staked" });
    }
    if (pos.type === "lending") {
      for (const dep of (pos.deposits ?? [])) {
        if ((dep.usdValue ?? 0) < 0.5) continue;
        const beta = TOKEN_BETA[dep.mint] ?? 0.9;
        rows.push({ label: `${dep.symbol} (lend)`, sub: "Kamino", mint: dep.mint, beta, cur: dep.usdValue, sim: dep.usdValue * (1 + move * beta), type: "lending" });
      }
    }
    if (pos.type === "lp") {
      const cur = pos.usdValue ?? 0;
      if (cur < 0.5) continue;
      rows.push({ label: pos.pair ?? "LP", sub: pos.protocol ?? "LP", mint: "_lp", beta: 0.65, cur, sim: cur * (1 + move * 0.65), type: "lp" });
    }
  }

  const currentTotal   = rows.reduce((s, r) => s + r.cur, 0);
  const simulatedTotal = rows.reduce((s, r) => s + r.sim, 0);
  return { rows, currentTotal, simulatedTotal };
}

function getHedge(rows, solMovePct) {
  if (solMovePct >= 0) return null;
  const volatile = rows
    .filter(r => r.type !== "stable" && r.cur > 5)
    .sort((a, b) => (a.sim - a.cur) - (b.sim - b.cur));
  if (!volatile.length) return null;
  const worst    = volatile[0];
  const hedgeUsd = worst.cur * 0.35;
  const savedUsd = hedgeUsd * Math.abs(solMovePct / 100) * worst.beta;
  if (savedUsd < 3) return null;
  return {
    fromSymbol: worst.label.replace(" (lend)", ""),
    fromUsd: hedgeUsd,
    toSymbol: "USDC",
    savedUsd,
  };
}

// ─── Skia: segmented portfolio bar ───────────────────────────────────────────
function PortfolioSegmentBar({ rows, currentTotal, width }) {
  const CHART_H = 32;
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) });
  }, [rows]);

  let xCursor = 0;
  return (
    <Canvas style={{ width, height: CHART_H }}>
      {rows.map((row, i) => {
        const segW = (row.cur / currentTotal) * width;
        const x    = xCursor;
        xCursor   += segW;
        const fillRatio = Math.max(0, Math.min(1, row.sim / row.cur));
        const movePct   = (fillRatio - 1) * 100;
        const col = row.type === "stable" ? BLUE : deltaColor(movePct);
        const gap = i < rows.length - 1 ? 2 : 0;
        return (
          <Group key={i}>
            <Rect x={x} y={0} width={segW - gap} height={CHART_H} color="rgba(255,255,255,0.07)" />
            <Rect x={x} y={0} width={(segW - gap) * fillRatio} height={CHART_H} color={col + "C0"} />
          </Group>
        );
      })}
    </Canvas>
  );
}

// ─── Skia: vertical bar chart (positions) ────────────────────────────────────
function PositionBarChart({ rows, width }) {
  const CHART_H = 72;
  const GAP     = 5;
  const count   = rows.length;
  const barW    = Math.max(16, (width - GAP * (count + 1)) / count);
  const maxVal  = Math.max(...rows.map(r => r.cur), 1);

  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, { duration: 650, easing: Easing.out(Easing.quad) });
  }, [rows]);

  return (
    <View>
      <Canvas style={{ width, height: CHART_H + 2 }}>
        {rows.map((row, i) => {
          const x       = GAP + i * (barW + GAP);
          const curH    = (row.cur / maxVal) * CHART_H;
          const simH    = Math.min((row.sim / maxVal) * CHART_H, curH);
          const fillRatio = row.cur > 0 ? row.sim / row.cur : 1;
          const movePct   = (fillRatio - 1) * 100;
          const col = row.type === "stable" ? BLUE : deltaColor(movePct);
          return (
            <Group key={i}>
              <Rect x={x} y={CHART_H - curH} width={barW} height={curH} color="rgba(255,255,255,0.07)" />
              <Rect x={x} y={CHART_H - simH} width={barW} height={simH} color={col + "CC"} />
            </Group>
          );
        })}
      </Canvas>
      {/* X-axis labels */}
      <View style={{ flexDirection: "row", width, paddingHorizontal: GAP }}>
        {rows.map((row, i) => (
          <Text
            key={i}
            style={[styles.barLabel, { width: barW + GAP, marginRight: i < rows.length - 1 ? 0 : 0 }]}
            numberOfLines={1}
          >
            {row.label.split(" ")[0]}
          </Text>
        ))}
      </View>
    </View>
  );
}

// ─── Risk insights (no template text) ────────────────────────────────────────
function RiskInsights({ rows, currentTotal, simulatedTotal, solMovePct }) {
  const insights = [];
  const total = currentTotal;
  if (!total) return null;

  const solLike   = rows.filter(r => r.type === "sol" || r.type === "staked").reduce((s,r) => s+r.cur, 0);
  const memePct   = rows.filter(r => r.type === "meme").reduce((s,r) => s+r.cur, 0) / total * 100;
  const stablePct = rows.filter(r => r.type === "stable").reduce((s,r) => s+r.cur, 0) / total * 100;
  const biggestLoser = [...rows].filter(r => r.sim < r.cur).sort((a,b) => (a.sim-a.cur)-(b.sim-b.cur))[0];

  if (biggestLoser) {
    const lossPct = ((biggestLoser.sim - biggestLoser.cur) / biggestLoser.cur * 100).toFixed(0);
    insights.push(`${biggestLoser.label} is your biggest risk — beta ${biggestLoser.beta.toFixed(2)}× means ${lossPct}% drop vs SOL's ${solMovePct}%`);
  }
  if (memePct > 10) {
    insights.push(`${memePct.toFixed(0)}% in high-beta meme coins — these amplify losses in downturns`);
  }
  if (stablePct > 20) {
    insights.push(`${stablePct.toFixed(0)}% in stablecoins acts as a natural hedge — holds flat through this`);
  }
  if (solLike / total > 0.7 && solMovePct < 0) {
    insights.push(`${((solLike/total)*100).toFixed(0)}% of value moves 1:1 with SOL — heavily concentrated`);
  }

  if (!insights.length) return null;
  return (
    <View style={styles.insightBox}>
      {insights.map((text, i) => (
        <View key={i} style={styles.insightRow}>
          <View style={styles.insightDot} />
          <Text style={styles.insightText}>{text}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function RiskSnapshotCard({ snapshot, portfolio, solBalance, onHedge }) {
  const { scenarioLabel = "this scenario", solMovePct = -40 } = snapshot ?? {};
  const isBear = solMovePct < 0;

  const { rows, currentTotal, simulatedTotal } = useMemo(
    () => simulate(portfolio, solBalance, solMovePct),
    [portfolio, solBalance, solMovePct]
  );

  const delta      = simulatedTotal - currentTotal;
  const deltaPct   = currentTotal > 0 ? (delta / currentTotal) * 100 : 0;
  const mainColor  = isBear ? (Math.abs(deltaPct) > 35 ? RED : ORANGE) : GREEN;
  const hedge      = getHedge(rows, solMovePct);
  const hasData    = rows.length > 0 && currentTotal > 0;

  // Card width (fits in chat bubble)
  const CARD_W     = 300;
  const BAR_PAD    = 16;
  const chartWidth = CARD_W - BAR_PAD * 2;

  const handleHedge = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    if (hedge && onHedge) onHedge(hedge.fromSymbol, hedge.toSymbol, hedge.fromUsd);
  };

  if (!hasData) {
    return (
      <View style={styles.card}>
        <Text style={styles.scenarioLabel}>{scenarioLabel}</Text>
        <Text style={styles.emptyText}>Load your portfolio first to see the impact.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, { borderColor: mainColor + "30" }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {isBear
            ? <TrendingDown size={14} color={mainColor} strokeWidth={2.5} />
            : <TrendingUp   size={14} color={mainColor} strokeWidth={2.5} />
          }
          <Text style={styles.scenarioLabel} numberOfLines={1}>{scenarioLabel.toUpperCase()}</Text>
        </View>
        <Text style={[styles.deltaPctBadge, { color: mainColor, borderColor: mainColor + "40" }]}>
          {fmtPct(deltaPct)}
        </Text>
      </View>

      {/* ── Segmented portfolio bar ── */}
      <View style={styles.barSection}>
        <View style={styles.overflowClip}>
          <PortfolioSegmentBar rows={rows} currentTotal={currentTotal} width={chartWidth} />
        </View>
        <View style={styles.totalRow}>
          <View>
            <Text style={styles.totalLabel}>NOW</Text>
            <Text style={styles.totalValue}>{fmtUsd(currentTotal)}</Text>
          </View>
          <View style={[styles.arrowBox, { borderColor: mainColor + "40" }]}>
            <Text style={[styles.arrowText, { color: mainColor }]}>
              {fmtUsd(delta, true)}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.totalLabel}>BECOMES</Text>
            <Text style={[styles.totalValue, { color: mainColor }]}>{fmtUsd(simulatedTotal)}</Text>
          </View>
        </View>
      </View>

      {/* ── Vertical bar chart ── */}
      {rows.length > 1 && (
        <View style={styles.barChartSection}>
          <Text style={styles.sectionLabel}>POSITION IMPACT</Text>
          <PositionBarChart rows={rows} width={chartWidth} />
        </View>
      )}

      {/* ── Per-position rows ── */}
      <View style={styles.positionsSection}>
        <Text style={styles.sectionLabel}>BREAKDOWN</Text>
        {rows.map((row, i) => {
          const rowDelta    = row.sim - row.cur;
          const rowMovePct  = row.cur > 0 ? (rowDelta / row.cur) * 100 : 0;
          const rowColor    = row.type === "stable" ? BLUE : deltaColor(rowMovePct);
          const fillRatio   = Math.max(0, Math.min(1, row.sim / row.cur));
          return (
            <View key={i} style={styles.posRow}>
              <View style={styles.posLeft}>
                <Text style={styles.posLabel}>{row.label}</Text>
                <Text style={styles.posBeta}>β {row.beta.toFixed(2)}</Text>
              </View>
              <View style={styles.posRight}>
                <View style={styles.miniBarTrack}>
                  <View style={[styles.miniBarFill, { width: `${fillRatio * 100}%`, backgroundColor: rowColor }]} />
                </View>
                <View style={styles.posNumbers}>
                  <Text style={styles.posCur}>{fmtUsd(row.cur)}</Text>
                  <Text style={[styles.posDelta, { color: rowDelta === 0 ? "rgba(255,255,255,0.35)" : rowColor }]}>
                    {rowDelta === 0 ? "flat" : fmtPct(rowMovePct)}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>

      {/* ── Risk insights ── */}
      <RiskInsights rows={rows} currentTotal={currentTotal} simulatedTotal={simulatedTotal} solMovePct={solMovePct} />

      {/* ── Hedge CTA ── */}
      {hedge && onHedge && (
        <TouchableOpacity style={[styles.hedgeBtn, { borderColor: GREEN + "40" }]} onPress={handleHedge} activeOpacity={0.8}>
          <Shield size={13} color={GREEN} strokeWidth={2.5} />
          <Text style={styles.hedgeBtnText}>
            Hedge {fmtUsd(hedge.fromUsd)} {hedge.fromSymbol} → {hedge.toSymbol}
          </Text>
          <Text style={styles.hedgeSave}>saves {fmtUsd(hedge.savedUsd)}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(14,18,15,0.97)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    overflow: "hidden",
    gap: 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  scenarioLabel: { color: "rgba(255,255,255,0.45)", fontSize: 10, fontFamily: F.headBold, letterSpacing: 0.8, flex: 1 },
  deltaPctBadge: { fontSize: 12, fontFamily: F.headBold, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },

  barSection: { paddingHorizontal: 16, gap: 10, paddingBottom: 14 },
  overflowClip: { borderRadius: 8, overflow: "hidden" },
  totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  totalLabel: { color: "rgba(255,255,255,0.30)", fontSize: 9, fontFamily: F.headSemi, letterSpacing: 0.5, marginBottom: 2 },
  totalValue: { color: "#FFFFFF", fontSize: 20, fontFamily: F.headBold, letterSpacing: -0.5 },
  arrowBox: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  arrowText: { fontSize: 13, fontFamily: F.headBold },

  barChartSection: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  barLabel: { color: "rgba(255,255,255,0.35)", fontSize: 9, fontFamily: F.medium, textAlign: "center" },

  positionsSection: { paddingHorizontal: 14, paddingBottom: 4, gap: 2 },
  sectionLabel: { color: "rgba(255,255,255,0.25)", fontSize: 9, fontFamily: F.headBold, letterSpacing: 0.8, marginBottom: 6 },
  posRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  posLeft: { gap: 1 },
  posLabel: { color: "#FFFFFF", fontSize: 13, fontFamily: F.headSemi },
  posBeta: { color: "rgba(255,255,255,0.30)", fontSize: 9, fontFamily: F.medium },
  posRight: { flex: 1, paddingLeft: 12, gap: 4 },
  miniBarTrack: { height: 3, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" },
  miniBarFill: { height: 3, borderRadius: 2 },
  posNumbers: { flexDirection: "row", justifyContent: "space-between" },
  posCur: { color: "rgba(255,255,255,0.40)", fontSize: 11, fontFamily: F.medium },
  posDelta: { fontSize: 11, fontFamily: F.headSemi },

  insightBox: { marginHorizontal: 14, marginTop: 4, marginBottom: 8, backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 12, gap: 7 },
  insightRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  insightDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.35)", marginTop: 6, flexShrink: 0 },
  insightText: { color: "rgba(255,255,255,0.55)", fontSize: 12, fontFamily: F.medium, lineHeight: 18, flex: 1 },

  hedgeBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    margin: 14, marginTop: 6,
    backgroundColor: "rgba(74,222,128,0.07)",
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 11,
  },
  hedgeBtnText: { color: GREEN, fontSize: 13, fontFamily: F.headSemi, flex: 1 },
  hedgeSave: { color: "rgba(74,222,128,0.60)", fontSize: 11, fontFamily: F.medium },

  emptyText: { color: "rgba(255,255,255,0.35)", fontSize: 13, fontFamily: F.medium, padding: 16 },
});
