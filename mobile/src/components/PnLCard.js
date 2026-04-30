import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { TrendingUp, TrendingDown, Minus } from "lucide-react-native";
import { F } from "../theme/fonts";
import { getPortfolioPnL } from "../services/pnlService";
import { fetchPricesForMints } from "../services/priceService";

const GREEN   = "#4ADE80";
const RED     = "#F87171";
const MUTED   = "rgba(255,255,255,0.35)";
const BDR     = "rgba(255,255,255,0.10)";

function fmt(usd, alwaysSign = false) {
  const sign  = usd >= 0 ? (alwaysSign ? "+" : "") : "-";
  const abs   = Math.abs(usd);
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  if (abs >= 1)    return `${sign}$${abs.toFixed(2)}`;
  return `${sign}$${abs.toFixed(3)}`;
}

export default function PnLCard({ walletAddress, onPress }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!walletAddress) return;
    getPortfolioPnL(walletAddress, {})        // prices omitted; yields cover most value
      .then(setStats)
      .catch(() => {});
  }, [walletAddress]);

  if (!stats || stats.tradeCount === 0) return null;

  const positive = stats.totalPnlUsd >= 0;
  const Icon = positive ? TrendingUp : stats.totalPnlUsd < -0.001 ? TrendingDown : Minus;
  const color = positive ? GREEN : RED;

  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.8}>
      <View style={s.left}>
        <View style={[s.iconBox, { borderColor: `${color}30`, backgroundColor: `${color}10` }]}>
          <Icon size={16} color={color} strokeWidth={2.5} />
        </View>
        <View>
          <Text style={s.label}>All-time gains</Text>
          <Text style={s.sub}>{stats.tradeCount} trade{stats.tradeCount !== 1 ? "s" : ""} tracked</Text>
        </View>
      </View>
      <View style={s.right}>
        <Text style={[s.pnl, { color }]}>{fmt(stats.totalPnlUsd, true)}</Text>
        <Text style={[s.pct, { color }]}>
          {positive ? "+" : ""}{stats.totalPnlPct.toFixed(1)}%
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 16, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: BDR,
  },
  left:    { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBox: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  label:   { color: "#fff", fontSize: 14, fontFamily: F.semibold },
  sub:     { color: MUTED, fontSize: 12, fontFamily: F.regular, marginTop: 1 },
  right:   { alignItems: "flex-end" },
  pnl:     { fontSize: 16, fontFamily: F.headBold },
  pct:     { fontSize: 12, fontFamily: F.semibold, marginTop: 1 },
});
