import React from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Linking,
} from "react-native";
import { TrendingUp, TrendingDown, AlertTriangle, ExternalLink } from "lucide-react-native";
import { F } from "../theme/fonts";

const GREEN  = "#4ADE80";
const RED    = "#F87171";
const YELLOW = "#FBBF24";
const GLASS  = "rgba(255,255,255,0.05)";
const BORDER = "rgba(255,255,255,0.09)";
const MUTED  = "rgba(255,255,255,0.35)";
const SEC    = "rgba(255,255,255,0.60)";

function fmt(n, dp = 2) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function fmtUsd(n) {
  if (n == null) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e6) return sign + "$" + fmt(abs / 1e6, 2) + "M";
  if (abs >= 1e3) return sign + "$" + fmt(abs / 1e3, 1) + "K";
  return sign + "$" + fmt(abs, 2);
}

function Row({ label, value, valueColor }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

function ScenarioBar({ scenario }) {
  const color = scenario.color === "green" ? GREEN : scenario.color === "red" ? RED : YELLOW;
  const pnlColor = scenario.pnl >= 0 ? GREEN : RED;
  return (
    <View style={[s.scenarioRow, { borderLeftColor: color }]}>
      <View style={{ flex: 1 }}>
        <Text style={[s.scenarioLabel, { color }]}>{scenario.label}</Text>
        {scenario.note ? <Text style={s.scenarioNote}>{scenario.note}</Text> : null}
      </View>
      <Text style={[s.scenarioPnl, { color: pnlColor }]}>
        {scenario.pnl >= 0 ? "+" : ""}{fmtUsd(scenario.pnl)}
      </Text>
    </View>
  );
}

export default function CrossVenueCard({ data }) {
  if (!data) return null;
  const { view, perpLeg: leg, scenarios, summary, disclaimer } = data;
  if (!leg) return null;

  const isLong = leg.direction === "LONG";
  const dirColor = isLong ? GREEN : RED;
  const DirIcon = isLong ? TrendingUp : TrendingDown;

  const liqRisk = leg.leverage >= 20;

  return (
    <View style={s.card}>

      {/* ── Header ── */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.exchange}>JUPITER PERPS</Text>
          <Text style={s.viewLabel}>{view}</Text>
        </View>
        <View style={[s.dirPill, { backgroundColor: dirColor + "18", borderColor: dirColor + "40" }]}>
          <DirIcon size={13} color={dirColor} strokeWidth={2.5} />
          <Text style={[s.dirText, { color: dirColor }]}>{leg.direction}</Text>
        </View>
      </View>

      {/* ── Position details ── */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>POSITION</Text>
        <Row label="Asset"       value={leg.label ?? `${leg.symbol}-USD`} />
        <Row label="Margin"      value={fmtUsd(leg.margin)} />
        <Row label="Leverage"    value={`${leg.leverage}×`} />
        <Row label="Notional"    value={fmtUsd(leg.notional)} />
        <Row label="Entry"       value={`$${fmt(leg.entryPrice)}`} />
        <Row label="Est. Liq."   value={`$${fmt(leg.liqPrice)}`} valueColor={RED} />
      </View>

      {/* ── Cost ── */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>COST</Text>
        <Row label="Borrow rate (1h)" value={`${leg.funding1hPct}%`} />
        <Row label="Borrow rate (APR)" value={`${leg.fundingAprPct}%`} />
        <Row label="Est. 30-day cost"  value={fmtUsd(leg.borrowCost30d)} valueColor={RED} />
      </View>

      {/* ── Risk warning for high leverage ── */}
      {liqRisk && (
        <View style={s.riskRow}>
          <AlertTriangle size={13} color={YELLOW} strokeWidth={2} />
          <Text style={s.riskText}>
            {leg.leverage}× leverage — small moves can liquidate this position.
          </Text>
        </View>
      )}

      {/* ── Payoff scenarios ── */}
      {scenarios?.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>PAYOFF SCENARIOS</Text>
          {scenarios.map((sc, i) => <ScenarioBar key={i} scenario={sc} />)}
        </View>
      )}

      {/* ── Summary ── */}
      {summary && <Text style={s.summary}>{summary}</Text>}

      {/* ── Open in Jupiter button ── */}
      <TouchableOpacity
        style={s.jupBtn}
        onPress={() => Linking.openURL(leg.tradeUrl ?? "https://app.jup.ag/perps")}
        activeOpacity={0.8}
      >
        <Text style={s.jupBtnText}>Open in Jupiter Perps</Text>
        <ExternalLink size={13} color={GREEN} strokeWidth={2.2} />
      </TouchableOpacity>

      <Text style={s.disclaimer}>{disclaimer}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: "#080F0A",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginTop: 10,
    gap: 14,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerLeft: { gap: 3 },
  exchange: {
    fontSize: 10, fontFamily: F.headBold,
    color: GREEN, letterSpacing: 1.4,
  },
  viewLabel: {
    fontSize: 20, fontFamily: F.headBold,
    color: "#fff", letterSpacing: -0.3,
  },
  dirPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 10, borderWidth: 1,
  },
  dirText: { fontSize: 12, fontFamily: F.headBold, letterSpacing: 0.4 },

  section: {
    backgroundColor: GLASS,
    borderRadius: 12, borderWidth: 1, borderColor: BORDER,
    padding: 12, gap: 6,
  },
  sectionTitle: {
    fontSize: 10, fontFamily: F.semibold,
    color: MUTED, letterSpacing: 1.2, marginBottom: 4,
  },

  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowLabel: { fontSize: 13, color: MUTED, fontFamily: F.regular },
  rowValue: { fontSize: 13, color: "#fff", fontFamily: F.semibold, textAlign: "right" },

  riskRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "rgba(251,191,36,0.07)",
    borderRadius: 10, borderWidth: 1, borderColor: "rgba(251,191,36,0.18)",
    padding: 10,
  },
  riskText: { flex: 1, fontSize: 12, color: YELLOW, fontFamily: F.regular, lineHeight: 17 },

  scenarioRow: {
    flexDirection: "row", alignItems: "center",
    borderLeftWidth: 3, paddingLeft: 10, paddingVertical: 4,
  },
  scenarioLabel: { fontSize: 13, fontFamily: F.semibold },
  scenarioNote:  { fontSize: 11, color: MUTED, fontFamily: F.regular, marginTop: 1 },
  scenarioPnl:   { fontSize: 14, fontFamily: F.headBold },

  summary: {
    fontSize: 12, color: SEC, fontFamily: F.regular, lineHeight: 18,
  },

  jupBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1, borderColor: GREEN + "40",
    backgroundColor: GREEN + "0D",
  },
  jupBtnText: { fontSize: 14, fontFamily: F.semibold, color: GREEN },

  disclaimer: {
    fontSize: 11, color: MUTED, fontFamily: F.regular, lineHeight: 16, fontStyle: "italic",
  },
});
