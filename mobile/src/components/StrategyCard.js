import React, { useState, useRef } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  Linking, ActivityIndicator, Alert, Animated,
} from "react-native";
import { Bell, BellOff, Check, Zap } from "lucide-react-native";
import { F } from "../theme/fonts";
import { useEmbeddedSolanaWallet } from "@privy-io/expo";
import { subscribeAlert, unsubscribeAlert } from "../services/notifications";

const GLASS         = "rgba(255,255,255,0.07)";
const GLASS_MED     = "rgba(255,255,255,0.10)";
const GLASS_HEAVY   = "rgba(255,255,255,0.14)";
const GLASS_BORDER  = "rgba(255,255,255,0.12)";
const GLASS_BDR_L   = "rgba(255,255,255,0.18)";
const TEXT_PRI      = "#FFFFFF";
const TEXT_SEC      = "rgba(255,255,255,0.65)";
const TEXT_MUTED    = "rgba(255,255,255,0.35)";
const GREEN         = "#4ADE80";
const BLUE          = "#60A5FA";

const RISK_COLORS = {
  low:    "#4ADE80",
  medium: "#FBBF24",
  high:   "#F87171",
};

export default function StrategyCard({
  strategy,
  index,
  isPrimary,      // first card — gets "Best pick" treatment
  walletAddress,
  onTransactionReady,
  onExecuteStrategy,
}) {
  const riskColor = RISK_COLORS[strategy.risk] || "#888";
  const { wallets } = useEmbeddedSolanaWallet();
  const [executing, setExecuting]     = useState(false);
  const [alerted, setAlerted]         = useState(false);
  const [alertLoading, setAlertLoading] = useState(false);
  const [alertId, setAlertId]         = useState(null);

  // Bell animation
  const bellScale  = useRef(new Animated.Value(1)).current;
  const bellRotate = useRef(new Animated.Value(0)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;

  function animateBell() {
    Animated.sequence([
      Animated.timing(bellScale, { toValue: 1.3, duration: 150, useNativeDriver: true }),
      Animated.parallel([
        Animated.sequence([
          Animated.timing(bellRotate, { toValue: 1,    duration: 80, useNativeDriver: true }),
          Animated.timing(bellRotate, { toValue: -1,   duration: 80, useNativeDriver: true }),
          Animated.timing(bellRotate, { toValue: 0.5,  duration: 60, useNativeDriver: true }),
          Animated.timing(bellRotate, { toValue: 0,    duration: 60, useNativeDriver: true }),
        ]),
        Animated.timing(bellScale, { toValue: 1, duration: 280, useNativeDriver: true }),
      ]),
      Animated.timing(checkOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }

  function animateUnbell() {
    Animated.parallel([
      Animated.timing(checkOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(bellScale, { toValue: 0.8, duration: 100, useNativeDriver: true }),
        Animated.timing(bellScale, { toValue: 1,   duration: 150, useNativeDriver: true }),
      ]),
    ]).start();
  }

  async function handleAlertToggle() {
    if (!walletAddress) {
      Alert.alert("Wallet Required", "Connect your wallet to set alerts.");
      return;
    }
    setAlertLoading(true);
    try {
      if (alerted && alertId) {
        const result = await unsubscribeAlert(walletAddress, alertId);
        if (result?.success) { setAlerted(false); setAlertId(null); animateUnbell(); }
      } else {
        const result = await subscribeAlert(walletAddress, {
          protocol: strategy.protocol,
          action: strategy.action,
          condition: "apy_change",
          estimatedApy: strategy.estimated_apy || null,
          risk: strategy.risk || null,
        });
        if (result?.success) { setAlerted(true); setAlertId(result.alert?.id || null); animateBell(); }
      }
    } catch (err) {
      console.error("Alert toggle error:", err.message);
      Alert.alert("Error", "Couldn't update alert. Try again.");
    } finally {
      setAlertLoading(false);
    }
  }

  async function handleExecute() {
    // Jupiter swap — build quote inline
    if (strategy.protocol === "Jupiter Swap" && strategy.amount && wallets?.[0]) {
      setExecuting(true);
      try {
        const amountLamports = Math.floor(parseFloat(strategy.amount) * 1_000_000_000);
        const quoteRes = await fetch(
          `https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=${amountLamports}&slippageBps=50`
        );
        const quote = await quoteRes.json();
        if (quote.error) throw new Error(quote.error);

        const swapRes = await fetch("https://quote-api.jup.ag/v6/swap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quoteResponse: quote,
            userPublicKey: wallets[0].address,
            wrapAndUnwrapSol: true,
            dynamicComputeUnitLimit: true,
          }),
        });
        const swapData = await swapRes.json();
        if (swapData.error) throw new Error(swapData.error);

        const estimatedOut  = (parseInt(quote.outAmount, 10) / 1_000_000).toFixed(4);
        const priceImpact   = quote.priceImpactPct
          ? parseFloat(quote.priceImpactPct).toFixed(3)
          : "< 0.01";

        if (onTransactionReady) {
          onTransactionReady({
            type: "transaction_preview",
            protocol: "Jupiter",
            action: `Swap ${strategy.amount} SOL → USDC`,
            serializedTx: swapData.swapTransaction,
            estimatedOutput: `~${estimatedOut} USDC`,
            priceImpact: `${priceImpact}%`,
            fee: "~0.000005 SOL",
            why: `Best route via Jupiter across ${quote.routePlan?.length || "multiple"} DEXes.`,
            requiresApproval: true,
          });
        }
      } catch (err) {
        Alert.alert("Quote Failed", err.message);
      } finally {
        setExecuting(false);
      }
      return;
    }

    // All other protocols → send to agent via chat
    if (onExecuteStrategy) {
      const msg = strategy.action || `Execute ${strategy.protocol} strategy`;
      onExecuteStrategy(msg);
      return;
    }

    // Fallback: open URL
    if (strategy.url) Linking.openURL(strategy.url);
  }

  const bellRotation = bellRotate.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ["-15deg", "0deg", "15deg"],
  });

  return (
    <View style={[s.card, isPrimary && s.cardPrimary]}>

      {/* ── "Best pick" label for first card ── */}
      {isPrimary && (
        <View style={s.primaryLabel}>
          <Zap size={11} color={GREEN} strokeWidth={2.5} />
          <Text style={s.primaryLabelText}>Best pick for you</Text>
        </View>
      )}

      {/* ── Header ── */}
      <View style={s.header}>
        <View style={[s.indexBadge, isPrimary && s.indexBadgePrimary]}>
          <Text style={[s.indexText, isPrimary && s.indexTextPrimary]}>{index + 1}</Text>
        </View>
        <Text style={s.protocol}>{strategy.protocol}</Text>
        {strategy.estimated_apy && (
          <View style={[s.apyBadge, isPrimary && s.apyBadgePrimary]}>
            <Text style={[s.apyText, isPrimary && s.apyTextPrimary]}>{strategy.estimated_apy}</Text>
          </View>
        )}
      </View>

      {/* ── Action ── */}
      <Text style={s.action}>{strategy.action}</Text>

      {/* ── Amount ── */}
      {strategy.amount && (
        <Text style={s.amount}>
          Amount: <Text style={s.amountValue}>{strategy.amount} SOL</Text>
        </Text>
      )}

      {/* ── Risk badge ── */}
      {strategy.risk && (
        <View style={[s.riskBadge, { borderLeftColor: riskColor }]}>
          <View style={[s.riskDot, { backgroundColor: riskColor }]} />
          <Text style={[s.riskText, { color: riskColor }]}>{strategy.risk} risk</Text>
        </View>
      )}

      {/* ── Why ── */}
      <Text style={s.why}>{strategy.why}</Text>

      {/* ── Buttons ── */}
      <View style={s.buttonsRow}>
        <TouchableOpacity
          style={[s.executeBtn, isPrimary && s.executeBtnPrimary]}
          onPress={handleExecute}
          activeOpacity={0.8}
          disabled={executing}
        >
          {executing ? (
            <ActivityIndicator size="small" color={isPrimary ? "#000" : "#fff"} />
          ) : (
            <Text style={[s.executeBtnText, isPrimary && s.executeBtnTextPrimary]}>
              {strategy.protocol === "Jupiter Swap" ? "Swap" : "Execute"}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.alertBtn, alerted && s.alertBtnActive]}
          onPress={handleAlertToggle}
          activeOpacity={0.8}
          disabled={alertLoading}
        >
          {alertLoading ? (
            <ActivityIndicator size="small" color={alerted ? GREEN : BLUE} />
          ) : (
            <View style={s.alertBtnInner}>
              <Animated.View style={{ transform: [{ scale: bellScale }, { rotate: bellRotation }] }}>
                {alerted
                  ? <Bell size={15} color={GREEN} />
                  : <BellOff size={15} color={BLUE} />}
              </Animated.View>
              <Text style={[s.alertBtnText, alerted && s.alertBtnTextActive]}>
                {alerted ? "Alerted" : "Alert me"}
              </Text>
              {alerted && (
                <Animated.View style={{ opacity: checkOpacity }}>
                  <Check size={13} color={GREEN} strokeWidth={3} />
                </Animated.View>
              )}
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: GLASS,
    borderRadius: 20, padding: 18, marginTop: 10,
    borderWidth: 1, borderColor: GLASS_BORDER,
  },
  cardPrimary: {
    borderColor: "rgba(74,222,128,0.30)",
    backgroundColor: "rgba(74,222,128,0.04)",
  },

  primaryLabel: {
    flexDirection: "row", alignItems: "center", gap: 5,
    alignSelf: "flex-start",
    backgroundColor: "rgba(74,222,128,0.12)",
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
    marginBottom: 12,
    borderWidth: 1, borderColor: "rgba(74,222,128,0.25)",
  },
  primaryLabelText: {
    color: GREEN, fontSize: 11, fontFamily: F.headBold, letterSpacing: 0.5,
  },

  header: { flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 10 },
  indexBadge: {
    width: 26, height: 26, borderRadius: 8,
    backgroundColor: GLASS_MED, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: GLASS_BORDER,
  },
  indexBadgePrimary: {
    backgroundColor: "rgba(74,222,128,0.15)",
    borderColor: "rgba(74,222,128,0.30)",
  },
  indexText:        { color: TEXT_PRI,  fontSize: 12, fontWeight: "900" },
  indexTextPrimary: { color: GREEN },

  protocol: { color: TEXT_PRI, fontSize: 16, fontFamily: F.headBold, flex: 1, letterSpacing: 0.3 },

  apyBadge: {
    backgroundColor: "rgba(74,222,128,0.08)",
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: "rgba(74,222,128,0.18)",
  },
  apyBadgePrimary: {
    backgroundColor: "rgba(74,222,128,0.15)",
    borderColor: "rgba(74,222,128,0.35)",
  },
  apyText:        { color: GREEN, fontSize: 13, fontFamily: F.headBold },
  apyTextPrimary: { color: GREEN, fontSize: 14 },

  action: { color: TEXT_SEC, fontSize: 15, marginBottom: 8, fontFamily: F.medium },
  amount: { color: TEXT_MUTED, fontSize: 13, marginBottom: 10, fontFamily: F.medium },
  amountValue: { color: TEXT_PRI, fontFamily: F.bold },

  riskBadge: {
    flexDirection: "row", alignItems: "center", alignSelf: "flex-start",
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 10,
    gap: 6, backgroundColor: "rgba(0,0,0,0.25)",
    borderWidth: 1, borderColor: GLASS_BORDER, borderLeftWidth: 3,
  },
  riskDot:  { width: 7, height: 7, borderRadius: 4 },
  riskText: { fontSize: 12, fontFamily: F.headSemi, letterSpacing: 0.3 },

  why: { color: TEXT_SEC, fontSize: 14, lineHeight: 21, marginBottom: 14, fontFamily: F.regular },

  buttonsRow: { flexDirection: "row", gap: 10, marginTop: 4 },

  // Execute — ghost by default, green fill for primary
  executeBtn: {
    flex: 1, backgroundColor: GLASS_HEAVY,
    borderRadius: 14, paddingVertical: 13, alignItems: "center",
    borderWidth: 1, borderColor: GLASS_BDR_L,
  },
  executeBtnPrimary: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
  executeBtnText:        { color: TEXT_PRI, fontSize: 14, fontFamily: F.headBold, letterSpacing: 0.5 },
  executeBtnTextPrimary: { color: "#000" },

  // Alert Me
  alertBtn: {
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(96,165,250,0.08)",
    borderRadius: 14, paddingVertical: 13, paddingHorizontal: 16,
    borderWidth: 1, borderColor: "rgba(96,165,250,0.20)",
  },
  alertBtnActive: {
    backgroundColor: "rgba(74,222,128,0.08)",
    borderColor: "rgba(74,222,128,0.25)",
  },
  alertBtnInner: { flexDirection: "row", alignItems: "center", gap: 7 },
  alertBtnText:        { color: BLUE,  fontSize: 13, fontFamily: F.headBold },
  alertBtnTextActive:  { color: GREEN },
});
