import { View, Text, StyleSheet } from "react-native";
import { F } from "../theme/fonts";

const GREEN   = "#4ADE80";
const RED     = "#F87171";
const YELLOW  = "#FBBF24";
const GLASS   = "rgba(255,255,255,0.06)";
const BORDER  = "rgba(255,255,255,0.10)";
const PRI     = "#FFFFFF";
const SEC     = "rgba(255,255,255,0.55)";
const MUTED   = "rgba(255,255,255,0.30)";

function labelColor(label) {
  if (label === "Bullish") return GREEN;
  if (label === "Bearish") return RED;
  return YELLOW;
}

function ScoreBar({ score }) {
  // score 0–100 → position on bar
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 62 ? GREEN : pct <= 38 ? RED : YELLOW;
  return (
    <View style={styles.barTrack}>
      {/* coloured fill */}
      <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color + "55" }]} />
      {/* zone labels */}
      <View style={styles.barZones}>
        <Text style={[styles.zoneLabel, { color: RED }]}>Bearish</Text>
        <Text style={[styles.zoneLabel, { color: YELLOW }]}>Neutral</Text>
        <Text style={[styles.zoneLabel, { color: GREEN }]}>Bullish</Text>
      </View>
      {/* thumb */}
      <View style={[styles.thumb, { left: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

function SourcePill({ label, value, color }) {
  if (value == null) return null;
  return (
    <View style={[styles.pill, { borderColor: color + "33", backgroundColor: color + "12" }]}>
      <Text style={[styles.pillLabel, { color: MUTED }]}>{label}</Text>
      <Text style={[styles.pillValue, { color }]}>{value}</Text>
    </View>
  );
}

export default function SentimentCard({ data }) {
  if (!data) return null;

  const { token, score, label, summary, sources, fetchedAt } = data;
  const color = labelColor(label);

  const onChain = sources?.onChain;
  const social  = sources?.social;
  const news    = sources?.news;

  const priceChangeStr = onChain?.priceChange24h != null
    ? `${onChain.priceChange24h > 0 ? "+" : ""}${onChain.priceChange24h.toFixed(1)}%`
    : null;

  const socialStr = social?.bullishPct != null
    ? `${social.bullishPct}% bulls`
    : null;

  const newsStr = news?.headlineCount != null
    ? `${news.headlineCount} articles`
    : null;

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.token}>{token}</Text>
          <Text style={styles.subtitle}>Social Sentiment</Text>
        </View>
        <View style={[styles.badge, { borderColor: color + "44", backgroundColor: color + "18" }]}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <Text style={[styles.badgeText, { color }]}>{label}</Text>
        </View>
      </View>

      {/* Score + bar */}
      <View style={styles.scoreRow}>
        <Text style={[styles.scoreNum, { color }]}>{score}</Text>
        <Text style={styles.scoreMax}>/100</Text>
      </View>
      <ScoreBar score={score} />

      {/* Summary */}
      {summary && <Text style={styles.summary}>{summary}</Text>}

      {/* Source pills */}
      {(onChain || social || news) && (
        <View style={styles.pills}>
          <SourcePill label="Price 24h"  value={priceChangeStr}           color={onChain?.priceChange24h >= 0 ? GREEN : RED} />
          <SourcePill label="Community"  value={socialStr}                color={color} />
          <SourcePill label="News"       value={newsStr}                  color={YELLOW} />
        </View>
      )}

      {fetchedAt && (
        <Text style={styles.timestamp}>
          updated {new Date(fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 10,
    backgroundColor: GLASS,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  token: {
    color: PRI,
    fontSize: 18,
    fontFamily: F.headBold,
    letterSpacing: -0.3,
  },
  subtitle: {
    color: MUTED,
    fontSize: 11,
    fontFamily: F.regular,
    marginTop: 2,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 12, fontFamily: F.headSemi, letterSpacing: 0.3 },

  scoreRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
    marginBottom: 10,
  },
  scoreNum: { fontSize: 36, fontFamily: F.headBold, letterSpacing: -1 },
  scoreMax: { fontSize: 14, color: MUTED, fontFamily: F.regular },

  barTrack: {
    height: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 4,
    marginBottom: 6,
    overflow: "visible",
    position: "relative",
  },
  barFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 4,
  },
  barZones: {
    flexDirection: "row",
    justifyContent: "space-between",
    position: "absolute",
    left: 0,
    right: 0,
    top: 12,
  },
  zoneLabel: { fontSize: 9, fontFamily: F.headSemi, letterSpacing: 0.5 },
  thumb: {
    position: "absolute",
    top: -3,
    width: 14,
    height: 14,
    borderRadius: 7,
    marginLeft: -7,
    borderWidth: 2,
    borderColor: "#000",
  },

  summary: {
    color: SEC,
    fontSize: 13,
    fontFamily: F.regular,
    lineHeight: 19,
    marginTop: 24,
    marginBottom: 12,
  },

  pills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  pill: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pillLabel: { fontSize: 10, fontFamily: F.headSemi, letterSpacing: 0.5 },
  pillValue: { fontSize: 12, fontFamily: F.headBold },

  timestamp: {
    color: MUTED,
    fontSize: 10,
    fontFamily: F.regular,
    marginTop: 10,
    textAlign: "right",
  },
});
