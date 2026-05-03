import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, Image, TouchableOpacity,
  ActivityIndicator, Pressable, Modal, ScrollView,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import Svg, { Path, Circle, G, Text as SvgText } from "react-native-svg";
import { fetchPricesForMints } from "../services/priceService";
import { API_URL } from "../services/api";
import { F } from "../theme/fonts";

const SOL_MINT  = "So11111111111111111111111111111111111111112";
const MSOL_MINT = "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So";

const PALETTE = [
  "#4ADE80", "#60A5FA", "#FBBF24", "#A78BFA",
  "#F472B6", "#34D399", "#FB923C", "#94A3B8",
];

// ─── Token image ──────────────────────────────────────────────────────────────

function TokenImg({ mint, symbol, logoUri, size = 40 }) {
  const [failed, setFailed] = useState(false);
  const letter = (symbol || "?")[0].toUpperCase();
  const color  = PALETTE[(symbol?.charCodeAt(0) ?? 0) % PALETTE.length];

  // Priority: DAS logoUri → Jupiter CDN → letter fallback
  const primary   = !failed && logoUri   ? { uri: logoUri }                          : null;
  const secondary = !failed && !logoUri  ? { uri: `https://img.jup.ag/tokens/${mint}` } : null;
  const src       = primary ?? secondary;

  if (src) {
    return (
      <Image
        source={src}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View style={[st.iconFallback, {
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color + "22", borderColor: color + "55",
    }]}>
      <Text style={{ color, fontSize: size * 0.42, fontFamily: F.headSemi }}>{letter}</Text>
    </View>
  );
}

// ─── Donut (used only in the detail sheet) ────────────────────────────────────

function Donut({ slices, size = 160, thick = 26 }) {
  const cx = size / 2, cy = size / 2, r = (size - thick) / 2;
  const total = slices.reduce((s, sl) => s + sl.value, 0);
  if (!total) return null;
  const GAP = 0.03;
  let a = -Math.PI / 2;
  const paths = [];
  for (let i = 0; i < slices.length; i++) {
    const span = (slices[i].value / total) * 2 * Math.PI - GAP;
    if (span <= 0) { a += GAP; continue; }
    const sx = cx + r * Math.cos(a), sy = cy + r * Math.sin(a);
    const ex = cx + r * Math.cos(a + span), ey = cy + r * Math.sin(a + span);
    const lg = span > Math.PI ? 1 : 0;
    paths.push(
      <Path key={i}
        d={`M ${sx.toFixed(1)} ${sy.toFixed(1)} A ${r} ${r} 0 ${lg} 1 ${ex.toFixed(1)} ${ey.toFixed(1)}`}
        fill="none" stroke={slices[i].color} strokeWidth={thick} strokeLinecap="butt" />
    );
    a += span + GAP;
  }
  return (
    <Svg width={size} height={size}>
      <Circle cx={cx} cy={cy} r={r} fill="none"
        stroke="rgba(255,255,255,0.07)" strokeWidth={thick} />
      <G>{paths}</G>
    </Svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtUsd = (n) => {
  if (n == null || isNaN(n)) return "—";
  if (n >= 1_000_000) return `$${(n/1e6).toFixed(2)}M`;
  if (n >= 10_000)    return `$${(n/1e3).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
};

const fmtPrice = (n) => {
  if (!n || n <= 0) return null;
  if (n >= 1000) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (n >= 1)    return `$${n.toFixed(2)}`;
  if (n >= 0.001) return `$${n.toFixed(4)}`;
  return `$${n.toExponential(2)}`;
};

const fmtBal = (n) => {
  if (n >= 1e6) return `${(n/1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n/1e3).toFixed(2)}k`;
  if (n < 0.00001) return n.toExponential(2);
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
};

const shortAddr = (a) => a ? `${a.slice(0,4)}...${a.slice(-4)}` : "—";

// ─── Detail sheet (pie chart + full breakdown) ────────────────────────────────

function DetailSheet({ visible, onClose, rows, totalUsd, walletAddress }) {
  const slices = rows.slice(0, 8).map((r, i) => ({
    label: r.symbol,
    value: r.usdValue,
    color: PALETTE[i % PALETTE.length],
  }));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} />
      <View style={st.sheet}>
        <View style={st.sheetHandle} />
        <Text style={st.sheetTitle}>Portfolio Breakdown</Text>
        <Text style={st.sheetAddr}>{shortAddr(walletAddress)}</Text>

        {/* Donut + legend */}
        <View style={st.chartSection}>
          <View style={st.donutWrap}>
            <Donut slices={slices} size={160} thick={26} />
            <View style={st.donutCenter}>
              <Text style={st.donutLabel}>Total</Text>
              <Text style={st.donutTotal}>{fmtUsd(totalUsd)}</Text>
            </View>
          </View>
          <View style={st.pieLegend}>
            {slices.map((sl, i) => (
              <View key={i} style={st.pieLegendItem}>
                <View style={[st.pieDot, { backgroundColor: sl.color }]} />
                <View>
                  <Text style={st.pieLabel}>{sl.label}</Text>
                  <Text style={st.piePercent}>
                    {((sl.value / totalUsd) * 100).toFixed(1)}%
                    <Text style={st.piePct2}> · {fmtUsd(sl.value)}</Text>
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Full token table */}
        <ScrollView style={st.tableScroll} showsVerticalScrollIndicator={false}>
          <View style={st.tableHeader}>
            <Text style={[st.thCell, { flex: 2 }]}>Token</Text>
            <Text style={[st.thCell, { flex: 1, textAlign: "right" }]}>Price</Text>
            <Text style={[st.thCell, { flex: 1, textAlign: "right" }]}>Balance</Text>
            <Text style={[st.thCell, { flex: 1, textAlign: "right" }]}>Value</Text>
          </View>
          {rows.map((row, i) => (
            <View key={row.mint} style={[st.tableRow, i === 0 && { borderTopWidth: 0 }]}>
              <View style={[st.tdCell, { flex: 2, flexDirection: "row", alignItems: "center", gap: 8 }]}>
                <TokenImg mint={row.mint} symbol={row.symbol} logoUri={row.logoUri} size={28} />
                <View>
                  <Text style={st.tdName}>{row.symbol}</Text>
                  <Text style={st.tdSub} numberOfLines={1}>{row.name}</Text>
                </View>
              </View>
              <Text style={[st.tdCell, { flex: 1, textAlign: "right", color: "rgba(255,255,255,0.5)", fontSize: 12 }]}>
                {fmtPrice(row.pricePerToken) ?? "—"}
              </Text>
              <Text style={[st.tdCell, { flex: 1, textAlign: "right", color: "rgba(255,255,255,0.5)", fontSize: 12 }]}>
                {fmtBal(row.balance)}
              </Text>
              <Text style={[st.tdCell, { flex: 1, textAlign: "right", color: "#fff", fontFamily: F.medium, fontSize: 13 }]}>
                {fmtUsd(row.usdValue)}
              </Text>
            </View>
          ))}
          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Main card ────────────────────────────────────────────────────────────────

async function fetchChanges(mints) {
  try {
    const res = await fetch(`${API_URL}/api/prices/changes?mints=${mints.join(",")}`);
    if (res.ok) return res.json();
  } catch {}
  return {};
}

const MAX_VISIBLE = 4;

export default function PortfolioCard({ portfolio }) {
  const {
    walletAddress, domain, domains = [],
    solBalance = 0, tokens = [], positions = [],
  } = portfolio ?? {};

  const allDomains = [...new Set([...(domain ? [domain] : []), ...domains])];

  const [prices,  setPrices]  = useState(null);
  const [changes, setChanges] = useState({});
  const [copied,  setCopied]  = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    const mints = new Set([SOL_MINT, ...tokens.map((t) => t.mint)]);
    for (const pos of positions) {
      if (pos.type === "liquid_stake" && pos.mint) mints.add(pos.mint);
    }
    const arr = [...mints];
    fetchPricesForMints(arr).then(setPrices).catch(() => setPrices({}));
    fetchChanges(arr).then(setChanges).catch(() => {});
  }, [walletAddress]);

  const solPrice = prices?.[SOL_MINT] ?? 0;
  const solUsd   = solBalance * solPrice;

  const lstRows = positions
    .filter((p) => p.type === "liquid_stake")
    .map((p) => {
      const bal      = p.lstBalance ?? p.msolBalance ?? 0;
      const price    = prices?.[p.mint] ?? solPrice;
      const usdValue = p.usdValue > 0 ? p.usdValue : bal * price;
      return {
        mint: p.mint ?? MSOL_MINT,
        symbol: p.symbol ?? "mSOL",
        name: p.protocol ?? "Staked SOL",
        balance: bal,
        usdValue,
        pricePerToken: price || null,
        logoUri: p.logoUri ?? null,
      };
    });

  const tokenRows = tokens.map((t) => {
    const price    = prices?.[t.mint] ?? 0;
    const usdValue = t.usdValue > 0 ? t.usdValue : t.balance * price;
    return {
      ...t,
      usdValue,
      pricePerToken: price || (t.balance > 0 ? usdValue / t.balance : null),
      logoUri: t.logoUri ?? null,
    };
  });

  const allRows = [
    { mint: SOL_MINT, symbol: "SOL", name: "Solana", balance: solBalance,
      usdValue: solUsd, pricePerToken: solPrice, logoUri: null },
    ...lstRows,
    ...tokenRows,
  ].filter((r) => r.usdValue > 0.001 || r.balance > 0)
   .sort((a, b) => b.usdValue - a.usdValue);

  const totalUsd = allRows.reduce((s, r) => s + r.usdValue, 0);
  const visible  = expanded ? allRows : allRows.slice(0, MAX_VISIBLE);
  const more     = allRows.length - MAX_VISIBLE;

  // Compact legend under header
  const legendItems = allRows.slice(0, 5).map((r, i) => ({
    label: r.symbol,
    color: PALETTE[i % PALETTE.length],
    pct: totalUsd > 0 ? (r.usdValue / totalUsd * 100).toFixed(1) : "0",
  }));

  async function copyAddr() {
    await Clipboard.setStringAsync(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <View style={st.card}>

      {/* ── Header row: address + total + Positions button ── */}
      <View style={st.header}>
        <View style={st.headerLeft}>
          <TouchableOpacity style={st.addrRow} onPress={copyAddr} activeOpacity={0.7}>
            <Text style={st.addrText}>
              {allDomains[0] ?? shortAddr(walletAddress)}
            </Text>
            <Text style={st.copyIcon}>{copied ? "✓" : "⎘"}</Text>
          </TouchableOpacity>

          {prices ? (
            <Text style={st.totalValue}>{fmtUsd(totalUsd)}</Text>
          ) : (
            <ActivityIndicator size="small" color="rgba(255,255,255,0.3)" style={{ marginTop: 4 }} />
          )}

          {/* Inline legend */}
          {prices && totalUsd > 0 && (
            <View style={st.legendRow}>
              {legendItems.map((l, i) => (
                <View key={i} style={st.legendItem}>
                  <View style={[st.legendDot, { backgroundColor: l.color }]} />
                  <Text style={st.legendText}>{l.label} {l.pct}%</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <TouchableOpacity style={st.posBtn} onPress={() => setSheetOpen(true)} activeOpacity={0.8}>
          <Text style={st.posBtnIcon}>◉</Text>
          <Text style={st.posBtnText}>Positions</Text>
        </TouchableOpacity>
      </View>

      {/* ── Token rows ── */}
      <View style={st.tokenList}>
        <View style={st.tokensLabel}>
          <Text style={st.tokensTitle}>Tokens</Text>
          {prices && <Text style={st.tokensTotal}>{fmtUsd(totalUsd)}</Text>}
        </View>

        {visible.map((row, idx) => {
          const chg   = changes[row.mint] ?? null;
          const isPos = chg > 0, isNeg = chg < 0;
          const chgColor = isPos ? "#4ADE80" : isNeg ? "#F87171" : "rgba(255,255,255,0.3)";

          return (
            <View key={row.mint} style={[st.tokenRow, idx === 0 && { borderTopWidth: 0 }]}>
              <TokenImg mint={row.mint} symbol={row.symbol} logoUri={row.logoUri} size={40} />

              <View style={st.tokenMid}>
                <Text style={st.tokenName} numberOfLines={1}>{row.name || row.symbol}</Text>
                <View style={st.tokenSub}>
                  {row.pricePerToken != null && (
                    <Text style={st.tokenPrice}>{fmtPrice(row.pricePerToken)}</Text>
                  )}
                  {chg != null && (
                    <Text style={[st.tokenChg, { color: chgColor }]}>
                      {isPos ? "+" : ""}{chg.toFixed(2)}%
                    </Text>
                  )}
                </View>
              </View>

              <View style={st.tokenRight}>
                <Text style={st.tokenUsd}>{prices ? fmtUsd(row.usdValue) : "—"}</Text>
                <Text style={st.tokenBal}>{fmtBal(row.balance)} {row.symbol}</Text>
              </View>
            </View>
          );
        })}

        {/* Show more / less */}
        {more > 0 && (
          <TouchableOpacity style={st.showMore} onPress={() => setExpanded((v) => !v)} activeOpacity={0.7}>
            <Text style={st.showMoreText}>
              {expanded ? "Show less" : `Show ${more} more`}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Detail sheet ── */}
      <DetailSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        rows={allRows}
        totalUsd={totalUsd}
        walletAddress={walletAddress}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const GLASS  = "rgba(255,255,255,0.06)";
const BORDER = "rgba(255,255,255,0.09)";
const W = "rgba(255,255,255,";

const st = StyleSheet.create({
  card: { marginTop: 8, gap: 2 },

  // Header
  header: {
    backgroundColor: GLASS,
    borderRadius: 16,
    borderWidth: 1, borderColor: BORDER,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  headerLeft: { flex: 1, gap: 2 },
  addrRow:  { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  addrText: { color: W + "0.45)", fontSize: 12, fontFamily: F.medium },
  copyIcon: { color: W + "0.25)", fontSize: 11 },
  totalValue: { color: "#fff", fontSize: 24, fontFamily: F.headSemi, letterSpacing: -0.5, marginTop: 2 },

  legendRow:  { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot:  { width: 7, height: 7, borderRadius: 3.5 },
  legendText: { color: W + "0.45)", fontSize: 11, fontFamily: F.medium },

  posBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(74,222,128,0.12)",
    borderRadius: 20, borderWidth: 1, borderColor: "rgba(74,222,128,0.25)",
    paddingHorizontal: 10, paddingVertical: 6,
    alignSelf: "flex-start",
  },
  posBtnIcon: { color: "#4ADE80", fontSize: 12 },
  posBtnText: { color: "#4ADE80", fontSize: 12, fontFamily: F.medium },

  // Token list
  tokenList: {
    backgroundColor: GLASS,
    borderRadius: 16,
    borderWidth: 1, borderColor: BORDER,
    overflow: "hidden",
  },
  tokensLabel: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4,
  },
  tokensTitle: { color: "#fff", fontSize: 13, fontFamily: F.headSemi },
  tokensTotal: { color: W + "0.4)", fontSize: 12, fontFamily: F.medium },

  tokenRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER,
  },
  iconFallback: { alignItems: "center", justifyContent: "center", borderWidth: 1 },

  tokenMid:   { flex: 1, gap: 3 },
  tokenName:  { color: "#fff", fontSize: 14, fontFamily: F.medium },
  tokenSub:   { flexDirection: "row", alignItems: "center", gap: 6 },
  tokenPrice: { color: W + "0.4)", fontSize: 12, fontFamily: F.regular },
  tokenChg:   { fontSize: 12, fontFamily: F.medium },

  tokenRight: { alignItems: "flex-end", gap: 2 },
  tokenUsd:   { color: "#fff", fontSize: 14, fontFamily: F.headSemi },
  tokenBal:   { color: W + "0.35)", fontSize: 12, fontFamily: F.regular },

  showMore: {
    alignItems: "center", paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER,
  },
  showMoreText: { color: W + "0.4)", fontSize: 13, fontFamily: F.medium },

  // Sheet
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    backgroundColor: "#0A0F0C",
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: 20, paddingTop: 12,
    maxHeight: "88%",
  },
  sheetHandle: {
    alignSelf: "center", width: 36, height: 4,
    borderRadius: 2, backgroundColor: W + "0.15)",
    marginBottom: 16,
  },
  sheetTitle: { color: "#fff", fontSize: 17, fontFamily: F.headSemi, marginBottom: 2 },
  sheetAddr:  { color: W + "0.35)", fontSize: 12, fontFamily: F.regular, marginBottom: 20 },

  chartSection: {
    flexDirection: "row", alignItems: "center", gap: 20, marginBottom: 24,
  },
  donutWrap:   { position: "relative", width: 160, height: 160 },
  donutCenter: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center", justifyContent: "center",
  },
  donutLabel: { color: W + "0.4)", fontSize: 11, fontFamily: F.regular },
  donutTotal: { color: "#fff", fontSize: 15, fontFamily: F.headSemi, marginTop: 2 },

  pieLegend:     { flex: 1, gap: 12 },
  pieLegendItem: { flexDirection: "row", alignItems: "center", gap: 10 },
  pieDot:        { width: 10, height: 10, borderRadius: 5 },
  pieLabel:      { color: "#fff", fontSize: 13, fontFamily: F.medium },
  piePercent:    { color: "#4ADE80", fontSize: 12, fontFamily: F.medium, marginTop: 1 },
  piePct2:       { color: W + "0.4)", fontSize: 12, fontFamily: F.regular },

  tableScroll:  {},
  tableHeader:  {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  thCell: { color: W + "0.3)", fontSize: 11, fontFamily: F.medium, letterSpacing: 0.5 },
  tableRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER,
  },
  tdCell:  { flex: 1, justifyContent: "center" },
  tdName:  { color: "#fff", fontSize: 13, fontFamily: F.medium },
  tdSub:   { color: W + "0.35)", fontSize: 11, fontFamily: F.regular, marginTop: 1 },
});
