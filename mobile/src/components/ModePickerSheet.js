import React from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { F } from "../theme/fonts";

const { width } = Dimensions.get("window");

export default function ModePickerSheet({ onPick }) {
  return (
    <View style={s.overlay}>
      <SafeAreaView style={s.inner}>

        {/* Logo / wordmark */}
        <View style={s.logoRow}>
          <View style={s.logoCircle}>
            <Text style={s.logoEmoji}>🏠</Text>
          </View>
          <View>
            <Text style={s.appName}>Homie</Text>
            <Text style={s.appSub}>one app, two worlds</Text>
          </View>
        </View>

        {/* Mode cards */}
        <View style={s.cardsRow}>

          {/* Learn mode */}
          <TouchableOpacity
            style={[s.card, s.cardLearn]}
            onPress={() => onPick("learn")}
            activeOpacity={0.88}
          >
            <Text style={s.cardEmoji}>🎮</Text>
            <View style={s.cardBadge}>
              <Text style={s.cardBadgeText}>Beginner</Text>
            </View>
            <Text style={s.cardTitle}>Learn mode</Text>
            <Text style={s.cardDesc}>
              Duolingo-style screens.{"\n"}No jargon. Learn with YOUR{"\n"}real wallet.
            </Text>
          </TouchableOpacity>

          {/* Pro mode */}
          <TouchableOpacity
            style={[s.card, s.cardPro]}
            onPress={() => onPick("pro")}
            activeOpacity={0.88}
          >
            <Text style={s.cardEmoji}>⚡</Text>
            <View style={[s.cardBadge, s.cardBadgePro]}>
              <Text style={[s.cardBadgeText, { color: "#FBBF24" }]}>Expert</Text>
            </View>
            <Text style={s.cardTitle}>Pro mode</Text>
            <Text style={s.cardDesc}>
              Full chat + DeFi dashboard.{"\n"}Swap, stake, lend —{"\n"}all in one.
            </Text>
          </TouchableOpacity>

        </View>

        {/* Insight callout */}
        <View style={s.insight}>
          <Text style={s.insightText}>
            No fake examples. Every lesson uses{" "}
            <Text style={s.insightBold}>your real wallet</Text>
            {" "}— your actual tokens, your real balance.
          </Text>
        </View>

        <Text style={s.switchHint}>You can switch anytime — no progress lost.</Text>

      </SafeAreaView>
    </View>
  );
}

const GREEN  = "#4ADE80";
const YELLOW = "#FBBF24";
const BG     = "#000000";

const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BG,
    zIndex: 100,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
    gap: 28,
  },

  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  logoCircle: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: "rgba(74,222,128,0.12)",
    borderWidth: 1, borderColor: "rgba(74,222,128,0.25)",
    alignItems: "center", justifyContent: "center",
  },
  logoEmoji: { fontSize: 26 },
  appName: {
    color: "#fff",
    fontSize: 26,
    fontFamily: F.headBold,
    letterSpacing: -0.5,
  },
  appSub: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 13,
    fontFamily: F.regular,
    marginTop: 2,
  },

  cardsRow: {
    flexDirection: "row",
    gap: 12,
  },

  card: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    gap: 10,
    minHeight: 210,
  },
  cardLearn: {
    backgroundColor: "rgba(74,222,128,0.07)",
    borderColor: "rgba(74,222,128,0.25)",
  },
  cardPro: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(255,255,255,0.12)",
  },

  cardEmoji: { fontSize: 28 },

  cardBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(74,222,128,0.15)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  cardBadgePro: {
    backgroundColor: "rgba(251,191,36,0.12)",
  },
  cardBadgeText: {
    color: GREEN,
    fontSize: 11,
    fontFamily: F.headSemi,
    letterSpacing: 0.3,
  },

  cardTitle: {
    color: "#fff",
    fontSize: 18,
    fontFamily: F.headBold,
    letterSpacing: -0.3,
  },
  cardDesc: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 13,
    fontFamily: F.regular,
    lineHeight: 20,
  },

  insight: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    padding: 16,
  },
  insightText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    fontFamily: F.regular,
    lineHeight: 22,
    textAlign: "center",
  },
  insightBold: {
    color: "#fff",
    fontFamily: F.headSemi,
  },

  switchHint: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 12,
    fontFamily: F.regular,
    textAlign: "center",
  },
});
