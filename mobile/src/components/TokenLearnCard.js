import React, { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, ScrollView, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { F } from "../theme/fonts";
import { getExplainer } from "@homie/lesson-content";
import { API_URL } from "../services/api";

const GREEN  = "#4ADE80";
const BG     = "#000000";
const GLASS  = "rgba(255,255,255,0.06)";
const BORDER = "rgba(255,255,255,0.09)";
const MUTED  = "rgba(255,255,255,0.4)";
const SEC    = "rgba(255,255,255,0.6)";

// ─── Token image (mirrors PortfolioCard logic) ────────────────────────────────

function TokenImg({ logoUri, mint, symbol, size = 44 }) {
  const [src, setSrc] = useState(
    logoUri
      ? { uri: logoUri }
      : mint
        ? { uri: `https://img.jup.ag/tokens/${mint}` }
        : null,
  );
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <View style={[img.fallback, { width: size, height: size, borderRadius: size / 2 }]}>
        <Text style={[img.fallbackTxt, { fontSize: size * 0.4 }]}>
          {(symbol?.[0] ?? "?").toUpperCase()}
        </Text>
      </View>
    );
  }
  return (
    <Image
      source={src}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      onError={() => {
        if (logoUri && src.uri === logoUri && mint) {
          setSrc({ uri: `https://img.jup.ag/tokens/${mint}` });
        } else {
          setFailed(true);
        }
      }}
    />
  );
}

const img = StyleSheet.create({
  fallback: {
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center", justifyContent: "center",
  },
  fallbackTxt: { color: SEC, fontFamily: "System", fontWeight: "700" },
});

// ─── Live rates fetcher (cached per session) ─────────────────────────────────

let _rates = null;
let _ratesAt = 0;
async function fetchRates() {
  if (_rates && Date.now() - _ratesAt < 5 * 60 * 1000) return _rates;
  try {
    const res = await fetch(`${API_URL}/api/rates`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`rates ${res.status}`);
    _rates = await res.json();
    _ratesAt = Date.now();
    return _rates;
  } catch {
    return null;
  }
}

// ─── Detail modal ─────────────────────────────────────────────────────────────

function TokenDetailModal({ token, visible, onClose, onLearnMore, onAskHomie }) {
  const [apy, setApy] = useState(null);
  const explainer = getExplainer(token?.mint ?? null);

  useEffect(() => {
    if (!visible || !explainer.rateKey) return;
    fetchRates().then((r) => {
      if (r && explainer.rateKey) setApy(r[explainer.rateKey] ?? null);
    });
  }, [visible, explainer.rateKey]);

  if (!token) return null;

  const isSOL    = !token.mint;
  const symbol   = token.symbol ?? (isSOL ? "SOL" : "???");
  const balance  = isSOL ? token.solBalance : token.balance;
  const usdValue = token.usdValue ?? 0;
  const change24h = token.change24h ?? null;
  const name     = explainer.name ?? token.name ?? symbol;
  const color    = explainer.color ?? GREEN;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={m.root}>
        <SafeAreaView edges={["top"]} style={m.header}>
          <TouchableOpacity style={m.closeBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={m.closeTxt}>✕</Text>
          </TouchableOpacity>
        </SafeAreaView>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={m.scroll}>

          {/* Token identity */}
          <View style={m.identRow}>
            <TokenImg logoUri={token.logoUri} mint={token.mint} symbol={symbol} size={56} />
            <View style={m.identMid}>
              <Text style={m.identName}>{name}</Text>
              <Text style={m.identSymbol}>{symbol}</Text>
            </View>
            <View style={[m.apyPill, { backgroundColor: `${color}18`, borderColor: `${color}40` }]}>
              {apy != null ? (
                <>
                  <Text style={[m.apyNum, { color }]}>{apy.toFixed(1)}%</Text>
                  <Text style={m.apyLabel}>APY</Text>
                </>
              ) : (
                <Text style={[m.apyNum, { color: MUTED }]}>{explainer.isStaking ? "—" : "stable"}</Text>
              )}
            </View>
          </View>

          {/* Balance card */}
          <View style={[m.balCard, { borderColor: `${color}30` }]}>
            <View style={m.balRow}>
              <Text style={m.balAmt}>
                {balance != null ? `${Number(balance).toFixed(4)} ${symbol}` : "—"}
              </Text>
              {change24h != null && (
                <Text style={[m.change, { color: change24h >= 0 ? GREEN : "#F87171" }]}>
                  {change24h >= 0 ? "+" : ""}{change24h.toFixed(2)}%
                </Text>
              )}
            </View>
            <Text style={m.balUsd}>${usdValue.toFixed(2)} USD</Text>

            {apy != null && balance != null && token.solPriceUsd != null && (
              <View style={m.earningRow}>
                <Text style={m.earningLabel}>Earning automatically</Text>
                <Text style={[m.earningAmt, { color }]}>
                  +${(usdValue * apy / 100).toFixed(2)} / year
                </Text>
              </View>
            )}
          </View>

          {/* Tagline */}
          <View style={m.tagBox}>
            <Text style={m.tagText}>{explainer.tagline}</Text>
          </View>

          {/* What / How / Action sections */}
          <View style={m.section}>
            <Text style={m.sectionLabel}>WHAT IS IT?</Text>
            <Text style={m.sectionBody}>{explainer.what}</Text>
          </View>

          <View style={m.section}>
            <Text style={m.sectionLabel}>HOW DOES IT WORK?</Text>
            <Text style={m.sectionBody}>{explainer.how}</Text>
          </View>

          <View style={m.section}>
            <Text style={m.sectionLabel}>WHAT CAN YOU DO WITH IT?</Text>
            <Text style={m.sectionBody}>{explainer.action}</Text>
          </View>

          {/* Actions */}
          <View style={m.actions}>
            {explainer.relatedLessonId && (
              <TouchableOpacity
                style={[m.actionBtn, m.actionBtnPrimary]}
                onPress={() => { onClose(); onLearnMore?.(explainer.relatedLessonId); }}
                activeOpacity={0.85}
              >
                <Text style={m.actionBtnPrimaryTxt}>
                  📚 {explainer.relatedLessonLabel ?? "Learn more"}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[m.actionBtn, m.actionBtnSecondary]}
              onPress={() => {
                const msg = `Explain ${name} to me. I hold ${Number(balance ?? 0).toFixed(4)} ${symbol} ($${usdValue.toFixed(2)}).`;
                onClose();
                onAskHomie?.(msg);
              }}
              activeOpacity={0.8}
            >
              <Text style={m.actionBtnSecondaryTxt}>⚡ Ask Homie about this</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const m = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: {
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4,
    flexDirection: "row", justifyContent: "flex-end",
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: GLASS, alignItems: "center", justifyContent: "center",
  },
  closeTxt: { color: MUTED, fontSize: 14, fontFamily: F.medium },
  scroll: { paddingHorizontal: 20, paddingTop: 8, gap: 16 },

  identRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 4 },
  identMid: { flex: 1, gap: 3 },
  identName: { color: "#fff", fontSize: 20, fontFamily: F.headBold },
  identSymbol: { color: MUTED, fontSize: 13, fontFamily: F.regular },
  apyPill: {
    borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 6, alignItems: "center",
  },
  apyNum: { fontSize: 16, fontFamily: F.headBold },
  apyLabel: { color: MUTED, fontSize: 10, fontFamily: F.regular },

  balCard: {
    backgroundColor: GLASS, borderRadius: 18, borderWidth: 1,
    padding: 18, gap: 6,
  },
  balRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  balAmt: { color: "#fff", fontSize: 22, fontFamily: F.headBold },
  change: { fontSize: 13, fontFamily: F.headSemi },
  balUsd: { color: MUTED, fontSize: 13, fontFamily: F.regular },
  earningRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginTop: 6, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER,
  },
  earningLabel: { color: SEC, fontSize: 12, fontFamily: F.regular },
  earningAmt: { fontSize: 13, fontFamily: F.headSemi },

  tagBox: {
    backgroundColor: "rgba(74,222,128,0.07)",
    borderRadius: 14, borderWidth: 1, borderColor: "rgba(74,222,128,0.15)",
    padding: 14,
  },
  tagText: { color: GREEN, fontSize: 14, fontFamily: F.medium, lineHeight: 22, textAlign: "center" },

  section: { gap: 6 },
  sectionLabel: {
    color: MUTED, fontSize: 10, fontFamily: F.headSemi, letterSpacing: 1.2,
  },
  sectionBody: { color: SEC, fontSize: 14, fontFamily: F.regular, lineHeight: 22 },

  actions: { gap: 10 },
  actionBtn: { borderRadius: 18, paddingVertical: 16, alignItems: "center" },
  actionBtnPrimary: { backgroundColor: GREEN },
  actionBtnPrimaryTxt: { color: "#000", fontSize: 15, fontFamily: F.headBold },
  actionBtnSecondary: {
    backgroundColor: GLASS, borderWidth: 1, borderColor: BORDER,
  },
  actionBtnSecondaryTxt: { color: SEC, fontSize: 14, fontFamily: F.medium },
});

// ─── Card (row shown in Wallet tab) ───────────────────────────────────────────

export default function TokenLearnCard({ token, onAskHomie, onLearnMore }) {
  const [modalVisible, setModalVisible] = useState(false);

  const isSOL    = !token.mint;
  const symbol   = token.symbol ?? (isSOL ? "SOL" : "???");
  const balance  = isSOL ? token.solBalance : token.balance;
  const usdValue = token.usdValue ?? 0;
  const change24h = token.change24h ?? null;
  const explainer = getExplainer(token.mint ?? null);
  const color     = explainer.color ?? GREEN;

  return (
    <>
      <TouchableOpacity style={c.card} onPress={() => setModalVisible(true)} activeOpacity={0.82}>
        <TokenImg logoUri={token.logoUri} mint={token.mint} symbol={symbol} size={44} />

        <View style={c.mid}>
          <View style={c.topRow}>
            <Text style={c.name} numberOfLines={1}>{explainer.name ?? token.name ?? symbol}</Text>
            {change24h != null && (
              <Text style={[c.change, { color: change24h >= 0 ? GREEN : "#F87171" }]}>
                {change24h >= 0 ? "+" : ""}{change24h.toFixed(2)}%
              </Text>
            )}
          </View>
          <Text style={c.tagline} numberOfLines={1}>{explainer.tagline}</Text>
        </View>

        <View style={c.right}>
          <Text style={c.usd}>${usdValue.toFixed(2)}</Text>
          <Text style={c.bal} numberOfLines={1}>
            {balance != null ? `${Number(balance).toFixed(4)} ${symbol}` : "—"}
          </Text>
        </View>
      </TouchableOpacity>

      <TokenDetailModal
        token={token}
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onLearnMore={onLearnMore}
        onAskHomie={onAskHomie}
      />
    </>
  );
}

const c = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: GLASS,
    borderRadius: 16, borderWidth: 1, borderColor: BORDER,
    padding: 14, marginBottom: 10,
  },
  mid: { flex: 1, gap: 3, minWidth: 0 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { color: "#fff", fontSize: 15, fontFamily: F.headSemi, flex: 1 },
  change: { fontSize: 12, fontFamily: F.medium },
  tagline: { color: MUTED, fontSize: 12, fontFamily: F.regular },

  right: { alignItems: "flex-end", gap: 3 },
  usd: { color: "#fff", fontSize: 15, fontFamily: F.headSemi },
  bal: { color: MUTED, fontSize: 11, fontFamily: F.regular },
});
