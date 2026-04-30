import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, Image, TouchableOpacity,
  ActivityIndicator, ScrollView,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { fetchPricesForMints } from "../services/priceService";

const SOL_MINT  = "So11111111111111111111111111111111111111112";
const MSOL_MINT = "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So";

const BAR_COLORS = [
  "#4ADE80", "#60A5FA", "#FBBF24", "#A78BFA",
  "#F472B6", "#34D399", "#FB923C", "#94A3B8",
];

const GLASS       = "rgba(255,255,255,0.06)";
const GLASS_MED   = "rgba(255,255,255,0.09)";
const BORDER      = "rgba(255,255,255,0.10)";
const TEXT_PRI    = "#FFFFFF";
const TEXT_SEC    = "rgba(255,255,255,0.55)";
const TEXT_MUTED  = "rgba(255,255,255,0.30)";

function fmt(n) {
  if (n == null || isNaN(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000)    return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}

function shortAddr(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function fmtBalance(balance, symbol) {
  if (balance >= 1_000_000) return `${(balance / 1_000_000).toFixed(2)}M`;
  if (balance >= 1_000)     return `${(balance / 1_000).toFixed(2)}k`;
  if (balance < 0.0001)     return balance.toExponential(2);
  return balance.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function TokenIcon({ mint, symbol, size = 36 }) {
  const [errored, setErrored] = useState(false);
  const uri = `https://img.jup.ag/tokens/${mint}`;
  const letter = (symbol || "?")[0].toUpperCase();
  const color = BAR_COLORS[symbol.charCodeAt(0) % BAR_COLORS.length];

  if (errored) {
    return (
      <View style={[styles.iconFallback, { width: size, height: size, borderRadius: size / 2, backgroundColor: color + "33", borderColor: color + "55" }]}>
        <Text style={[styles.iconLetter, { color, fontSize: size * 0.42 }]}>{letter}</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      onError={() => setErrored(true)}
    />
  );
}

const MAX_VISIBLE = 5;

export default function PortfolioCard({ portfolio }) {
  const { walletAddress, domain, domains = [], solBalance = 0, tokens = [] } = portfolio;
  // Merge single domain + domains array, deduplicate
  const allDomains = [...new Set([...(domain ? [domain] : []), ...domains])];

  const [prices, setPrices]     = useState(null);
  const [showAll, setShowAll]   = useState(false);
  const [copied, setCopied]     = useState(false);

  useEffect(() => {
    const mints = [SOL_MINT, ...tokens.map((t) => t.mint)];
    fetchPricesForMints(mints)
      .then(setPrices)
      .catch(() => setPrices({}));
  }, [walletAddress]);

  const solPrice  = prices?.[SOL_MINT]  ?? 0;
  const solUsd    = solBalance * solPrice;

  const enriched = tokens.map((t) => ({
    ...t,
    usdValue: (prices?.[t.mint] ?? 0) * t.balance,
  })).sort((a, b) => b.usdValue - a.usdValue);

  const totalUsd = solUsd + enriched.reduce((s, t) => s + t.usdValue, 0);

  // Distribution bar items
  const barItems = [
    { label: "SOL", usd: solUsd, color: BAR_COLORS[0] },
    ...enriched.slice(0, 6).map((t, i) => ({
      label: t.symbol,
      usd:   t.usdValue,
      color: BAR_COLORS[(i + 1) % BAR_COLORS.length],
    })),
  ].filter((b) => b.usd > 0);

  const visible = showAll ? enriched : enriched.slice(0, MAX_VISIBLE);
  const remaining = enriched.length - MAX_VISIBLE;

  async function copyAddress() {
    await Clipboard.setStringAsync(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <View style={styles.card}>
      {/* ── Wallet overview ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionIcon}>▣</Text>
          <Text style={styles.sectionTitle}>Wallet Overview</Text>
        </View>

        <Text style={styles.fieldLabel}>Address</Text>
        <TouchableOpacity style={styles.addrRow} onPress={copyAddress} activeOpacity={0.7}>
          <Text style={styles.addrText}>{shortAddr(walletAddress)}</Text>
          <Text style={styles.copyIcon}>{copied ? "✓" : "⎘"}</Text>
        </TouchableOpacity>

        {allDomains.length > 0 && (
          <View style={styles.domainRow}>
            {allDomains.map((d) => (
              <View key={d} style={styles.domainPill}>
                <Text style={styles.domainText}>{d}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>SOL Balance</Text>
            <Text style={styles.statValue}>{solBalance.toFixed(4)} SOL</Text>
            {prices && <Text style={styles.statSub}>{fmt(solUsd)}</Text>}
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Total Value</Text>
            {prices
              ? <Text style={styles.statValue}>{fmt(totalUsd)}</Text>
              : <ActivityIndicator size={14} color="rgba(255,255,255,0.3)" />}
          </View>
        </View>
      </View>

      {/* ── Token holdings ── */}
      {enriched.length > 0 && (
        <View style={styles.section}>
          <View style={styles.holdingsHeader}>
            <Text style={styles.sectionTitle}>Token Holdings · {shortAddr(walletAddress)}</Text>
            {prices && <Text style={styles.totalUsd}>{fmt(totalUsd)}</Text>}
          </View>

          {/* Distribution bar */}
          {prices && totalUsd > 0 && (
            <>
              <View style={styles.bar}>
                {barItems.map((b, i) => (
                  <View
                    key={i}
                    style={[styles.barSegment, {
                      flex: b.usd / totalUsd,
                      backgroundColor: b.color,
                      borderTopLeftRadius:  i === 0 ? 4 : 0,
                      borderBottomLeftRadius: i === 0 ? 4 : 0,
                      borderTopRightRadius:  i === barItems.length - 1 ? 4 : 0,
                      borderBottomRightRadius: i === barItems.length - 1 ? 4 : 0,
                    }]}
                  />
                ))}
              </View>
              <View style={styles.legend}>
                {[{ label: "SOL", color: BAR_COLORS[0], pct: (solUsd / totalUsd * 100) }, ...enriched.slice(0, 5).map((t, i) => ({
                  label: t.symbol,
                  color: BAR_COLORS[(i + 1) % BAR_COLORS.length],
                  pct: t.usdValue / totalUsd * 100,
                }))].filter((l) => l.pct > 0.5).map((l, i) => (
                  <View key={i} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: l.color }]} />
                    <Text style={styles.legendText}>{l.label} {l.pct.toFixed(1)}%</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* SOL row */}
          <View style={styles.tokenRow}>
            <TokenIcon mint={SOL_MINT} symbol="SOL" />
            <View style={styles.tokenMeta}>
              <Text style={styles.tokenName}>Solana</Text>
              <Text style={styles.tokenAddr}>{shortAddr(SOL_MINT)}</Text>
            </View>
            <View style={styles.tokenRight}>
              <Text style={styles.tokenUsd}>{fmt(solUsd)}</Text>
              <Text style={styles.tokenBal}>{fmtBalance(solBalance)}</Text>
            </View>
          </View>

          {/* SPL token rows */}
          {visible.map((t) => (
            <View key={t.mint} style={styles.tokenRow}>
              <TokenIcon mint={t.mint} symbol={t.symbol} />
              <View style={styles.tokenMeta}>
                <Text style={styles.tokenName}>{t.name || t.symbol}</Text>
                <Text style={styles.tokenAddr}>{shortAddr(t.mint)}</Text>
              </View>
              <View style={styles.tokenRight}>
                <Text style={styles.tokenUsd}>{prices ? fmt(t.usdValue) : "—"}</Text>
                <Text style={styles.tokenBal}>{fmtBalance(t.balance, t.symbol)}</Text>
              </View>
            </View>
          ))}

          {!showAll && remaining > 0 && (
            <TouchableOpacity style={styles.showMore} onPress={() => setShowAll(true)} activeOpacity={0.7}>
              <Text style={styles.showMoreText}>Show more ({remaining} remaining)</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 10,
    gap: 8,
  },
  section: {
    backgroundColor: GLASS,
    borderRadius: 18,
    borderWidth: 1, borderColor: BORDER,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14,
  },
  sectionIcon: { color: TEXT_SEC, fontSize: 14 },
  sectionTitle: { color: TEXT_PRI, fontSize: 14, fontWeight: "700" },

  fieldLabel: { color: TEXT_MUTED, fontSize: 11, fontWeight: "600", letterSpacing: 0.5, marginBottom: 4 },
  addrRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  addrText: { color: TEXT_SEC, fontSize: 13, fontFamily: "monospace" },
  copyIcon: { color: TEXT_MUTED, fontSize: 13 },

  domainRow: {
    flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12,
  },
  domainPill: {
    backgroundColor: "rgba(74,222,128,0.10)",
    borderRadius: 8, borderWidth: 1, borderColor: "rgba(74,222,128,0.20)",
    paddingHorizontal: 8, paddingVertical: 3,
  },
  domainText: { color: "#4ADE80", fontSize: 12, fontWeight: "600" },

  statsRow: { flexDirection: "row", gap: 16, marginTop: 4 },
  stat: { flex: 1 },
  statLabel: { color: TEXT_MUTED, fontSize: 11, marginBottom: 4 },
  statValue: { color: TEXT_PRI, fontSize: 20, fontWeight: "700" },
  statSub: { color: TEXT_SEC, fontSize: 12, marginTop: 2 },

  holdingsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  totalUsd: { color: TEXT_PRI, fontSize: 15, fontWeight: "700" },

  bar: { flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", marginBottom: 10, gap: 1 },
  barSegment: { minWidth: 2 },

  legend: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 3.5 },
  legendText: { color: TEXT_SEC, fontSize: 11 },

  tokenRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER,
  },
  iconFallback: { alignItems: "center", justifyContent: "center", borderWidth: 1 },
  iconLetter: { fontWeight: "700" },
  tokenMeta: { flex: 1 },
  tokenName: { color: TEXT_PRI, fontSize: 14, fontWeight: "600" },
  tokenAddr: { color: TEXT_MUTED, fontSize: 11, marginTop: 2, fontFamily: "monospace" },
  tokenRight: { alignItems: "flex-end" },
  tokenUsd: { color: TEXT_PRI, fontSize: 14, fontWeight: "600" },
  tokenBal: { color: TEXT_MUTED, fontSize: 12, marginTop: 2 },

  showMore: {
    alignItems: "center", paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER,
  },
  showMoreText: { color: TEXT_SEC, fontSize: 13, fontWeight: "500" },
});
