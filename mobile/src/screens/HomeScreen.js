import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, RefreshControl, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePrivy, useEmbeddedSolanaWallet } from "@privy-io/expo";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as SecureStore from "expo-secure-store";
import { MessageSquare, TrendingUp, Shield, Zap, RefreshCw, ArrowRight, Sparkles, QrCode } from "lucide-react-native";
import { F } from "../theme/fonts";
import { IMPORTED_KEY_STORE, IMPORTED_ADDR_STORE, walletImportSignal } from "../components/LoginSheet";
import { fetchPortfolio } from "../services/api";
import { fetchPricesForMints } from "../services/priceService";
import { loadProfile } from "../services/userProfile";
import { getPortfolioPnL } from "../services/pnlService";
import { loadAutopilot, AUTOPILOT_STRATEGIES } from "../services/autopilotService";
import AutopilotSheet from "../components/AutopilotSheet";
import ReceiveSheet from "../components/ReceiveSheet";

// ─── Palette ──────────────────────────────────────────────────────────────────
const BG     = "#000000";
const GLASS  = "rgba(255,255,255,0.06)";
const GLASS_H = "rgba(255,255,255,0.10)";
const BDR    = "rgba(255,255,255,0.10)";
const GREEN  = "#4ADE80";           // Reserved for PRIMARY action only
const GREEN_DIM = "rgba(74,222,128,0.55)"; // Icons, accents — not primary
const GREEN_SUBTLE = "rgba(74,222,128,0.10)"; // Backgrounds
const MUTED  = "rgba(255,255,255,0.35)";
const SEC    = "rgba(255,255,255,0.60)";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const SOLANA_RPC = "https://api.mainnet-beta.solana.com";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours();
  if (h < 5)  return "still up?";
  if (h < 12) return "good morning";
  if (h < 17) return "good afternoon";
  if (h < 21) return "good evening";
  return "good night";
}

function fmtUsd(n) {
  if (n == null || isNaN(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000)    return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}

function shortAddr(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

// ─── Contextual prompt based on wallet state ─────────────────────────────────
function getContextualPrompt(solBalance, totalUsd, activePositions) {
  if (solBalance == null || solBalance <= 0.001) {
    return {
      text: "Add some SOL to get started",
      sub: "Scan QR or copy your address to receive funds.",
      msg: "How do I add SOL to my wallet?",
      showQR: true,
    };
  }
  if (activePositions > 0) {
    return null; // experienced user — skip the prompt
  }
  const solDisplay = solBalance.toFixed(2);
  return {
    text: `You have ${solDisplay} SOL doing nothing`,
    sub: "Want to put it to work? Homie can show you how.",
    msg: `I have ${solDisplay} SOL sitting idle — what's the best way to put it to work?`,
    showQR: false,
  };
}

// ─── Stat pill ────────────────────────────────────────────────────────────────
function StatPill({ label, value, color = "#fff" }) {
  return (
    <View style={s.statPill}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, { color }]}>{value}</Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function HomeScreen({ navigation }) {
  const privyState   = usePrivy();
  const solWallet    = useEmbeddedSolanaWallet();
  const privyAddress = solWallet?.wallets?.[0]?.address ?? null;

  const [importedAddress, setImportedAddress] = useState(null);
  useEffect(() => {
    SecureStore.getItemAsync(IMPORTED_ADDR_STORE).then((a) => setImportedAddress(a || null));
    return walletImportSignal.subscribe((addr) => setImportedAddress(addr));
  }, []);

  const walletAddress = importedAddress ?? privyAddress;

  const [solBalance, setSolBalance]   = useState(null);
  const [portfolio, setPortfolio]     = useState(null);
  const [totalUsd, setTotalUsd]       = useState(null);
  const [pnl, setPnl]                 = useState(null);
  const [profile, setProfile]         = useState(null);
  const [autopilot, setAutopilot]     = useState(null);
  const [showAutopilot, setShowAutopilot] = useState(false);
  const [showReceive, setShowReceive]     = useState(false);
  const [refreshing, setRefreshing]   = useState(false);
  const [loading, setLoading]         = useState(true);

  const load = useCallback(async () => {
    if (!walletAddress) { setLoading(false); return; }

    try {
      // SOL balance — fast RPC call
      const conn = new Connection(SOLANA_RPC, "confirmed");
      const lamports = await conn.getBalance(new PublicKey(walletAddress));
      setSolBalance(lamports / LAMPORTS_PER_SOL);
    } catch {}

    try {
      const p = await fetchPortfolio(walletAddress);
      setPortfolio(p);

      // Total USD value
      const mints = [SOL_MINT, ...(p.tokens || []).map((t) => t.mint)];
      const prices = await fetchPricesForMints(mints);
      const solUsd = (p.solBalance ?? 0) * (prices[SOL_MINT] ?? 0);
      const tokensUsd = (p.tokens || []).reduce((sum, t) => sum + (prices[t.mint] ?? 0) * t.balance, 0);
      setTotalUsd(solUsd + tokensUsd);
    } catch {}

    try {
      const pnlStats = await getPortfolioPnL(walletAddress, {});
      if (pnlStats?.tradeCount > 0) setPnl(pnlStats);
    } catch {}

    try {
      const prof = await loadProfile(walletAddress);
      setProfile(prof);
    } catch {}

    try {
      const ap = await loadAutopilot(walletAddress);
      setAutopilot(ap);
    } catch {}

    setLoading(false);
  }, [walletAddress]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function openChat(initialMessage) {
    navigation.navigate("Chat", { initialMessage: initialMessage || null });
  }

  // ── Derived display values ────────────────────────────────────────────────
  const displayName  = portfolio?.domains?.[0] ?? portfolio?.domain ?? shortAddr(walletAddress);
  const riskLabel    = profile ? (
    profile.riskTolerance === "low"    ? "Safe"       :
    profile.riskTolerance === "medium" ? "Balanced"   : "Aggressive"
  ) : "Not set";
  const riskColor    = profile?.riskTolerance === "low" ? GREEN : profile?.riskTolerance === "medium" ? "#FBBF24" : "#F87171";

  const pnlPositive  = pnl && pnl.totalPnlUsd >= 0;
  const pnlColor     = pnlPositive ? GREEN : "#F87171";

  // Derive active positions count from portfolio
  const activePositions = portfolio?.positions?.length ?? 0;
  const tokenCount     = portfolio?.tokens?.length ?? 0;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN_DIM} />}
        >
          {/* ── Greeting ── */}
          <View style={s.header}>
            <View>
              <Text style={s.greeting}>{greeting()}</Text>
              {walletAddress ? (
                <Text style={s.addr}>{displayName}</Text>
              ) : (
                <Text style={s.addr}>no wallet connected</Text>
              )}
            </View>
            <TouchableOpacity style={s.chatIconBtn} onPress={() => openChat()} activeOpacity={0.8}>
              <MessageSquare size={20} color={GREEN_DIM} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={s.loadingBox}>
              <ActivityIndicator color={GREEN} />
              <Text style={s.loadingText}>loading your portfolio...</Text>
            </View>
          ) : (
            <>
              {/* ── Hero: total value ── */}
              <View style={s.heroCard}>
                <Text style={s.heroLabel}>Total Portfolio Value</Text>
                <Text style={s.heroValue}>{totalUsd != null ? fmtUsd(totalUsd) : "—"}</Text>
                {solBalance != null && (
                  <Text style={s.heroSub}>{solBalance.toFixed(4)} SOL</Text>
                )}
                {pnl && (
                  <View style={s.pnlRow}>
                    <TrendingUp size={13} color={pnlColor} strokeWidth={2.5} />
                    <Text style={[s.pnlText, { color: pnlColor }]}>
                      {pnlPositive ? "+" : ""}{fmtUsd(pnl.totalPnlUsd)} all-time · {pnl.tradeCount} trade{pnl.tradeCount !== 1 ? "s" : ""}
                    </Text>
                  </View>
                )}
              </View>

              {/* ── Stat pills ── */}
              <View style={s.pillRow}>
                <StatPill label="Risk profile" value={riskLabel} color={riskColor} />
                <StatPill
                  label="Positions"
                  value={activePositions > 0 ? `${activePositions} active` : "None"}
                  color={activePositions > 0 ? GREEN_DIM : MUTED}
                />
                <StatPill
                  label="Tokens"
                  value={tokenCount > 0 ? `${tokenCount} held` : "SOL only"}
                  color={SEC}
                />
              </View>

              {/* ── Contextual prompt (replaces quick actions grid for new users) ── */}
              {(() => {
                const prompt = getContextualPrompt(solBalance, totalUsd, activePositions);
                if (!prompt) return null;
                return (
                  <TouchableOpacity
                    style={s.contextCard}
                    onPress={() => prompt.showQR ? setShowReceive(true) : openChat(prompt.msg)}
                    activeOpacity={0.8}
                  >
                    <View style={s.contextLeft}>
                      <View style={s.contextBadge}>
                        {prompt.showQR
                          ? <QrCode size={18} color={GREEN_DIM} strokeWidth={2} />
                          : <Sparkles size={18} color={GREEN_DIM} strokeWidth={2} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.contextTitle}>{prompt.text}</Text>
                        <Text style={s.contextSub}>{prompt.sub}</Text>
                      </View>
                    </View>
                    <ArrowRight size={14} color={MUTED} strokeWidth={2} />
                  </TouchableOpacity>
                );
              })()}

              {/* ── Autopilot card — hidden until user has at least one action ── */}
              {(activePositions > 0 || autopilot?.enabled) && (
                <>
                  <Text style={s.sectionTitle}>Autopilot</Text>
                  <TouchableOpacity
                    style={[s.autopilotCard, autopilot?.enabled && s.autopilotCardActive]}
                    onPress={() => setShowAutopilot(true)}
                    activeOpacity={0.8}
                  >
                    <View style={s.autopilotLeft}>
                      <View style={[s.autopilotBadge, { backgroundColor: autopilot?.enabled ? GREEN_SUBTLE : "rgba(255,255,255,0.06)" }]}>
                        <Zap size={16} color={autopilot?.enabled ? GREEN_DIM : MUTED} strokeWidth={2.5} />
                      </View>
                      <View>
                        <Text style={s.autopilotTitle}>
                          {autopilot?.enabled
                            ? AUTOPILOT_STRATEGIES[autopilot.strategyId]?.name ?? "Active"
                            : "Not configured"}
                        </Text>
                        <Text style={s.autopilotSub}>
                          {autopilot?.enabled
                            ? `Alerts when drift ≥ ${autopilot.driftThreshold ?? 10}%`
                            : "Tap to set up your strategy"}
                        </Text>
                      </View>
                    </View>
                    <View style={[s.statusBadge, { backgroundColor: autopilot?.enabled ? GREEN_SUBTLE : "rgba(255,255,255,0.06)" }]}>
                      <Text style={[s.statusText, { color: autopilot?.enabled ? GREEN_DIM : MUTED }]}>
                        {autopilot?.enabled ? "ON" : "OFF"}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </>
              )}

              {/* ── Profile nudge (if not set) ── */}
              {!profile && (
                <TouchableOpacity style={s.nudgeCard} onPress={() => openChat("Set up my risk profile")} activeOpacity={0.8}>
                  <Shield size={16} color={GREEN_DIM} strokeWidth={2} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.nudgeTitle}>Set up your risk profile</Text>
                    <Text style={s.nudgeSub}>So Homie knows what to recommend for you</Text>
                  </View>
                  <ArrowRight size={14} color={MUTED} strokeWidth={2} />
                </TouchableOpacity>
              )}
            </>
          )}
        </ScrollView>

        {/* Autopilot config sheet */}
        <AutopilotSheet
          visible={showAutopilot}
          walletAddress={walletAddress}
          onClose={() => setShowAutopilot(false)}
          onSaved={(cfg) => setAutopilot(cfg)}
        />

        {/* Receive SOL sheet — QR + address */}
        <ReceiveSheet
          visible={showReceive}
          walletAddress={walletAddress}
          onClose={() => setShowReceive(false)}
        />

        {/* ── Ask Homie CTA — dominant element ── */}
        <View style={s.footer}>
          <TouchableOpacity style={s.chatBtn} onPress={() => openChat()} activeOpacity={0.85}>
            <MessageSquare size={22} color="#000" strokeWidth={2.5} />
            <Text style={s.chatBtnText}>Ask Homie anything</Text>
          </TouchableOpacity>
          <Text style={s.chatBtnHint}>Your DeFi guide — ask questions, get answers, execute trades</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BG },
  scroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 },

  header: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "flex-start", marginBottom: 24,
  },
  greeting: { color: "#fff", fontSize: 26, fontFamily: F.headBold, letterSpacing: -0.5 },
  addr:     { color: MUTED, fontSize: 13, fontFamily: F.regular, marginTop: 4 },
  chatIconBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center", justifyContent: "center",
  },

  loadingBox: { alignItems: "center", paddingTop: 60, gap: 12 },
  loadingText: { color: MUTED, fontSize: 14, fontFamily: F.regular },

  heroCard: {
    backgroundColor: GLASS, borderRadius: 24,
    borderWidth: 1, borderColor: BDR,
    padding: 24, marginBottom: 12,
  },
  heroLabel: { color: MUTED, fontSize: 12, fontFamily: F.medium, letterSpacing: 0.5, marginBottom: 8 },
  heroValue: { color: "#fff", fontSize: 42, fontFamily: F.headBold, letterSpacing: -1.5 },
  heroSub:   { color: SEC, fontSize: 15, fontFamily: F.regular, marginTop: 6 },
  pnlRow:    { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  pnlText:   { fontSize: 13, fontFamily: F.medium },

  pillRow: { flexDirection: "row", gap: 8, marginBottom: 24 },
  statPill: {
    flex: 1, backgroundColor: GLASS,
    borderRadius: 14, borderWidth: 1, borderColor: BDR,
    padding: 12, gap: 4,
  },
  statLabel: { color: MUTED, fontSize: 10, fontFamily: F.medium, letterSpacing: 0.3 },
  statValue: { fontSize: 13, fontFamily: F.headSemi },

  sectionTitle: { color: SEC, fontSize: 12, fontFamily: F.semibold, letterSpacing: 0.5, marginBottom: 10 },

  // ── Contextual prompt card ──
  contextCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: GLASS, borderRadius: 16,
    borderWidth: 1, borderColor: BDR,
    padding: 16, marginBottom: 20,
  },
  contextLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  contextBadge: {
    width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center",
    backgroundColor: GREEN_SUBTLE,
  },
  contextTitle: { color: "#fff", fontSize: 14, fontFamily: F.semibold },
  contextSub: { color: MUTED, fontSize: 12, fontFamily: F.regular, marginTop: 3 },

  nudgeCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: GLASS,
    borderRadius: 16, borderWidth: 1,
    borderColor: BDR,
    padding: 16,
  },
  nudgeTitle: { color: "#fff", fontSize: 14, fontFamily: F.semibold },
  nudgeSub:   { color: MUTED, fontSize: 12, fontFamily: F.regular, marginTop: 2 },

  autopilotCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: GLASS, borderRadius: 16,
    borderWidth: 1, borderColor: BDR,
    padding: 14, marginBottom: 16,
  },
  autopilotCardActive: {
    borderColor: "rgba(74,222,128,0.25)",
    backgroundColor: "rgba(74,222,128,0.04)",
  },
  autopilotLeft:  { flexDirection: "row", alignItems: "center", gap: 12 },
  autopilotBadge: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  autopilotTitle: { color: "#fff", fontSize: 14, fontFamily: F.semibold },
  autopilotSub:   { color: MUTED, fontSize: 12, fontFamily: F.regular, marginTop: 2 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText:  { fontSize: 11, fontFamily: F.headBold, letterSpacing: 0.5 },

  footer: { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 10 },
  chatBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: GREEN, borderRadius: 20,
    paddingVertical: 20,
    // Subtle glow to draw the eye
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  chatBtnText: { color: "#000", fontSize: 17, fontFamily: F.headBold, letterSpacing: 0.3 },
  chatBtnHint: {
    color: MUTED, fontSize: 11, fontFamily: F.regular,
    textAlign: "center", marginTop: 8,
  },
});
