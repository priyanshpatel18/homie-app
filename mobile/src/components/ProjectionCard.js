import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";

const TEXT_PRI  = "#FFFFFF";
const TEXT_SEC  = "rgba(255,255,255,0.65)";
const TEXT_MUTED = "rgba(255,255,255,0.35)";
const GREEN     = "#4ADE80";
const WARN      = "#FBBF24";
const RED       = "#F87171";
const GLASS     = "rgba(255,255,255,0.06)";
const GLASS_BDR = "rgba(255,255,255,0.10)";

const SCENARIOS = [
  { key: "bull", label: "Bull +30%", color: GREEN,  bg: "rgba(74,222,128,0.08)",  bdr: "rgba(74,222,128,0.20)" },
  { key: "base", label: "Base",      color: TEXT_SEC, bg: "rgba(255,255,255,0.05)", bdr: "rgba(255,255,255,0.10)" },
  { key: "bear", label: "Bear −30%", color: RED,    bg: "rgba(248,113,113,0.08)", bdr: "rgba(248,113,113,0.20)" },
];

function fmt(n) {
  if (n == null) return "—";
  if (Math.abs(n) >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return `$${n.toFixed(2)}`;
}

function fmtDaily(n) {
  if (n == null || n === 0) return "—";
  return `${fmt(n)}/day`;
}

function ScenarioBar({ scenario, data, maxEnd, isBase }) {
  if (!data) return null;
  const pct = maxEnd > 0 ? Math.max(0.06, data.endUsd / maxEnd) : 0.06;
  const yieldPositive = data.yieldUsd >= 0;

  return (
    <View style={[styles.scenarioBox, { backgroundColor: scenario.bg, borderColor: scenario.bdr }]}>
      <View style={styles.scenarioHeader}>
        <Text style={[styles.scenarioLabel, { color: scenario.color }]}>{scenario.label}</Text>
        {isBase && (
          <View style={styles.baseBadge}>
            <Text style={styles.baseBadgeText}>BASE</Text>
          </View>
        )}
        <Text style={[styles.scenarioEnd, { color: scenario.color }]}>{fmt(data.endUsd)}</Text>
      </View>

      {/* Bar */}
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { flex: pct, backgroundColor: scenario.color, opacity: 0.7 }]} />
        <View style={{ flex: 1 - pct }} />
      </View>

      <View style={styles.scenarioStats}>
        <Text style={styles.statText}>
          Yield: <Text style={{ color: yieldPositive ? GREEN : RED }}>{fmt(data.yieldUsd)}</Text>
        </Text>
        <Text style={styles.statText}>{fmtDaily(data.dailyUsd)}</Text>
      </View>
    </View>
  );
}

export default function ProjectionCard({ data }) {
  const [expanded, setExpanded] = useState(true);
  if (!data?.scenarios) return null;

  const { protocol, action, apy, days, amountUsd, currentSolPrice, scenarios } = data;
  const maxEnd = Math.max(
    scenarios.bull?.endUsd ?? 0,
    scenarios.base?.endUsd ?? 0,
    scenarios.bear?.endUsd ?? 0,
  );

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.header} onPress={() => setExpanded((e) => !e)} activeOpacity={0.8}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Yield Projection</Text>
          <Text style={styles.sub}>
            {protocol} · {days}d · {apy}% APY · {fmt(amountUsd)}
          </Text>
        </View>
        <Text style={styles.chevron}>{expanded ? "▲" : "▼"}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.body}>
          <View style={styles.solPriceRow}>
            <Text style={styles.solPriceLabel}>SOL at entry</Text>
            <Text style={styles.solPriceValue}>${currentSolPrice?.toFixed(2) ?? "—"}</Text>
          </View>

          {SCENARIOS.map((sc) => (
            <ScenarioBar
              key={sc.key}
              scenario={sc}
              data={scenarios[sc.key]}
              maxEnd={maxEnd}
              isBase={sc.key === "base"}
            />
          ))}

          <Text style={styles.disclaimer}>
            Projections assume fixed APY. SOL price scenarios: +30% / flat / −30%.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: GLASS,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: GLASS_BDR,
    marginTop: 10,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  headerLeft: { flex: 1 },
  title: { color: TEXT_PRI, fontSize: 15, fontWeight: "800" },
  sub: { color: TEXT_MUTED, fontSize: 12, marginTop: 3 },
  chevron: { color: TEXT_MUTED, fontSize: 12, marginLeft: 8 },

  body: { paddingHorizontal: 14, paddingBottom: 16, gap: 10 },

  solPriceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: GLASS_BDR,
    marginBottom: 2,
  },
  solPriceLabel: { color: TEXT_MUTED, fontSize: 12 },
  solPriceValue: { color: TEXT_SEC, fontSize: 12, fontWeight: "700" },

  scenarioBox: {
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    gap: 8,
  },
  scenarioHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  scenarioLabel: { fontSize: 13, fontWeight: "700", flex: 1 },
  scenarioEnd: { fontSize: 16, fontWeight: "800" },
  baseBadge: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  baseBadgeText: { color: TEXT_MUTED, fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },

  barTrack: {
    flexDirection: "row",
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  barFill: { borderRadius: 3 },

  scenarioStats: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statText: { color: TEXT_MUTED, fontSize: 12 },

  disclaimer: {
    color: TEXT_MUTED,
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
    marginTop: 4,
  },
});
