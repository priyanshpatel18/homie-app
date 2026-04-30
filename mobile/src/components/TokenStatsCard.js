import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, Image, TouchableOpacity,
  Clipboard, ActivityIndicator,
} from "react-native";
import SkiaLineChart from "./SkiaLineChart";
import { F } from "../theme/fonts";
import { fetchTokenChartRange } from "../services/api";

const CHART_H  = 200;
const RANGES   = ["1H", "24H", "7D", "30D", "1Y"];

// ─── Palette ─────────────────────────────────────────────────────────────────
const GLASS_BDR  = "rgba(255,255,255,0.10)";
const GLASS_MED  = "rgba(255,255,255,0.07)";
const GREEN      = "#4ADE80";
const RED        = "#F87171";
const TEXT_PRI   = "#FFFFFF";
const TEXT_MUTED = "rgba(255,255,255,0.35)";

// ─── Formatters ──────────────────────────────────────────────────────────────
function fmt(n) {
  if (n == null) return "—";
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3)  return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtPrice(n) {
  if (n == null) return "—";
  if (n >= 1000) return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (n >= 1)    return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(5)}`;
  return `$${n.toPrecision(4)}`;
}

function fmtSupply(n) {
  if (n == null) return "—";
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `${(n / 1e6).toFixed(2)}M`;
  return n.toLocaleString();
}

function riskLabel(change) {
  const abs = Math.abs(change ?? 0);
  if (abs > 15) return { label: "High Risk",   color: RED };
  if (abs > 5)  return { label: "Speculative", color: "#FBBF24" };
  return          { label: "Trusted",          color: GREEN };
}

function shortAddr(addr) {
  if (!addr || addr.length < 10) return addr ?? "";
  return addr.slice(0, 4) + "..." + addr.slice(-4);
}

// ─── Stat column ─────────────────────────────────────────────────────────────
function StatCol({ label, value, sub }) {
  return (
    <View style={styles.statCol}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function TokenStatsCard({ data: initialData }) {
  const [data,      setData]      = useState(initialData);
  const [range,     setRange]     = useState(initialData?.range ?? "24H");
  const [loading,   setLoading]   = useState(false);
  const [cardWidth, setCardWidth] = useState(0);
  const [copied,    setCopied]    = useState(false);
  const [imgError,  setImgError]  = useState(false);

  // Lana-style: when touch is active, show scrubbed price + Δ in header
  const [touchData, setTouchData] = useState(null);

  if (!data) return null;

  const {
    symbol, name, image, price, priceChange24h, priceChangeRange,
    volume24h, marketCap, fdv, supply, liquidity,
    prices, mintAddress,
  } = data;

  const displayChange = range === "24H" ? priceChange24h : (priceChangeRange ?? priceChange24h);
  const positive      = (displayChange ?? 0) >= 0;
  const changeColor   = positive ? GREEN : RED;
  const risk          = riskLabel(priceChange24h);
  const chartW        = cardWidth > 0 ? cardWidth - 32 : 0;

  // If user is touching the chart, use scrubbed values instead
  const showPrice     = touchData ? touchData.price : price;
  const showChange    = touchData ? touchData.changePct : displayChange;
  const showPositive  = (showChange ?? 0) >= 0;
  const showColor     = showPositive ? GREEN : RED;
  const isScrubbing   = touchData != null;

  async function switchRange(r) {
    if (r === range || loading) return;
    setRange(r);
    setLoading(true);
    try {
      const fresh = await fetchTokenChartRange(symbol, r);
      if (fresh && !fresh.error) {
        setData({ mintAddress, ...fresh });
        setImgError(false);
      }
    } catch {}
    setLoading(false);
  }

  function handleCopy() {
    if (!mintAddress) return;
    Clipboard.setString(mintAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const handleTouchActive = useCallback((td) => {
    setTouchData(td);
  }, []);

  return (
    <View
      style={styles.card}
      onLayout={(e) => setCardWidth(e.nativeEvent.layout.width)}
    >
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.logoRow}>
          {image && !imgError ? (
            <Image
              source={{ uri: image }}
              style={styles.logo}
              onError={() => setImgError(true)}
            />
          ) : (
            <View style={[styles.logo, styles.logoFallback]}>
              <Text style={styles.logoFallbackText}>{symbol?.[0] ?? "?"}</Text>
            </View>
          )}
          <View style={styles.nameBlock}>
            <View style={styles.nameRow}>
              <Text style={styles.tokenName}>{name}</Text>
              <Text style={styles.tokenSymbol}>{symbol}</Text>
            </View>
            {mintAddress && (
              <TouchableOpacity style={styles.addrRow} onPress={handleCopy} activeOpacity={0.7}>
                <Text style={styles.addrText}>{shortAddr(mintAddress)}</Text>
                <Text style={styles.copyIcon}>{copied ? "✓" : "⧉"}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={[styles.riskBadge, { borderColor: risk.color + "44", backgroundColor: risk.color + "18" }]}>
          <View style={[styles.riskDot, { backgroundColor: risk.color }]} />
          <Text style={[styles.riskText, { color: risk.color }]}>{risk.label}</Text>
        </View>
      </View>

      {/* ── Top stats — header price updates live on scrub ── */}
      <View style={styles.statsRow}>
        <View style={styles.statColWide}>
          <Text style={styles.statLabel}>
            {isScrubbing ? "SCRUBBING" : "PRICE"}
          </Text>
          <Text style={[styles.statValue, isScrubbing && { color: showColor }]}>
            {fmtPrice(showPrice)}
          </Text>
          <View style={styles.changeRow}>
            <Text style={[styles.changeBadge, { color: showColor }]}>
              {(showChange ?? 0) >= 0 ? "+" : ""}{(showChange ?? 0).toFixed(2)}%
              {isScrubbing ? "" : ` ${range}`}
            </Text>
          </View>
        </View>
        <View style={styles.statDivider} />
        <StatCol label="VOLUME"  value={fmt(volume24h)} />
        <View style={styles.statDivider} />
        <StatCol label="MKT CAP" value={fmt(marketCap)}  sub={`${supply ? (supply / 1e6).toFixed(0) + 'M' : '—'} holders`} />
      </View>

      {/* ── Range selector + chart ── */}
      <View style={styles.chartSection}>
        {/* Range buttons — pill style like Lana */}
        <View style={styles.rangeRow}>
          {RANGES.map((r) => {
            const active = range === r;
            return (
              <TouchableOpacity
                key={r}
                style={[styles.rangeBtn, active && styles.rangeBtnActive]}
                onPress={() => switchRange(r)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.rangeBtnText,
                  active && styles.rangeBtnTextActive,
                ]}>
                  {r}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Chart */}
        <View style={styles.chartBox}>
          {loading ? (
            <View style={[styles.chartLoader, { height: CHART_H }]}>
              <ActivityIndicator size="small" color={GREEN} />
            </View>
          ) : prices && prices.length > 1 && chartW > 0 ? (
            <SkiaLineChart
              prices={prices}
              width={chartW}
              height={CHART_H}
              positive={positive}
              range={range}
              animate
              onTouchActive={handleTouchActive}
            />
          ) : (
            <View style={{ height: CHART_H }} />
          )}
        </View>
      </View>

      {/* ── Bottom stats ── */}
      <View style={[styles.statsRow, styles.bottomStats]}>
        <StatCol label="LIQUIDITY" value={fmt(liquidity)} />
        <View style={styles.statDivider} />
        <StatCol label="SUPPLY"    value={fmtSupply(supply)} />
        <View style={styles.statDivider} />
        <StatCol label="FDV"       value={fmt(fdv)} />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  card: {
    alignSelf: "stretch",
    backgroundColor: "rgba(10,14,11,0.97)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: GLASS_BDR,
    overflow: "hidden",
    marginTop: 10,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    padding: 16,
    paddingBottom: 12,
  },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  logo: { width: 40, height: 40, borderRadius: 20, backgroundColor: GLASS_MED },
  logoFallback: { alignItems: "center", justifyContent: "center" },
  logoFallbackText: { color: TEXT_PRI, fontSize: 16, fontFamily: F.headBold },
  nameBlock: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  tokenName:   { color: TEXT_PRI,   fontSize: 16, fontFamily: F.headBold },
  tokenSymbol: { color: TEXT_MUTED, fontSize: 12, fontFamily: F.medium },
  addrRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  addrText: { color: TEXT_MUTED, fontSize: 11, fontFamily: F.regular },
  copyIcon: { color: TEXT_MUTED, fontSize: 10 },

  riskBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1,
  },
  riskDot:  { width: 6, height: 6, borderRadius: 3 },
  riskText: { fontSize: 11, fontFamily: F.headSemi, letterSpacing: 0.3 },

  // Stats
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: GLASS_BDR,
    paddingTop: 14,
  },
  statCol: { flex: 1 },
  statColWide: { flex: 1 },
  statLabel: {
    color: TEXT_MUTED, fontSize: 9, fontFamily: F.headSemi,
    letterSpacing: 1.2, marginBottom: 4,
  },
  statValue: { color: TEXT_PRI, fontSize: 16, fontFamily: F.headBold, letterSpacing: -0.3 },
  statSub:   { color: GREEN, fontSize: 10, fontFamily: F.medium, marginTop: 3 },
  statDivider: {
    width: 1, backgroundColor: GLASS_BDR, marginHorizontal: 12, marginVertical: 2,
  },
  changeRow: { marginTop: 4 },
  changeBadge: { fontSize: 11, fontFamily: F.headSemi },

  // Range selector — pill style
  chartSection: { paddingBottom: 4 },
  rangeRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 16,
    paddingBottom: 10,
    paddingTop: 2,
  },
  rangeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "transparent",
  },
  rangeBtnActive: {
    backgroundColor: "rgba(74,222,128,0.12)",
    borderColor: "rgba(74,222,128,0.25)",
  },
  rangeBtnText: {
    color: TEXT_MUTED,
    fontSize: 12,
    fontFamily: F.headSemi,
    letterSpacing: 0.3,
  },
  rangeBtnTextActive: {
    color: GREEN,
  },

  // Chart
  chartBox: { paddingHorizontal: 16, paddingBottom: 4 },
  chartLoader: { alignItems: "center", justifyContent: "center" },

  // Bottom stats
  bottomStats: { borderTopWidth: 1, borderTopColor: GLASS_BDR },
});
