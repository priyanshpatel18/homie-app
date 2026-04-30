/**
 * SandboxBanner — compact strip between header and chat.
 * Shows virtual portfolio value, real-time PnL, and a tap target for the dashboard.
 * Appears only when sandbox mode is active.
 */

import React, { useEffect, useRef } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
} from "react-native";
import { TrendingUp, TrendingDown, ChevronRight } from "lucide-react-native";

// ─── Palette (sandbox = violet, not green) ───
const VIOLET        = "#A78BFA";
const VIOLET_LIGHT  = "#C4B5FD";
const VIOLET_DIM    = "rgba(167,139,250,0.08)";
const VIOLET_BORDER = "rgba(167,139,250,0.20)";
const GREEN         = "#4ADE80";
const RED           = "#F87171";
const TEXT_PRI      = "#FFFFFF";
const TEXT_SEC      = "rgba(255,255,255,0.60)";
const TEXT_MUTED    = "rgba(255,255,255,0.35)";

export default function SandboxBanner({ totalUsd = 0, pnlAbsolute = 0, pnlPercent = 0, onOpen }) {
  const isGain   = pnlAbsolute >= 0;
  const pnlColor = isGain ? GREEN : RED;
  const sign     = isGain ? "+" : "-";

  // Pulsing dot — signals "live simulation running"
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.0, duration: 1400, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <TouchableOpacity style={styles.banner} onPress={onOpen} activeOpacity={0.75}>
      {/* Left: label */}
      <View style={styles.leftGroup}>
        <Animated.View style={[styles.dot, { opacity: pulse }]} />
        <Text style={styles.sandboxLabel}>SANDBOX</Text>
      </View>

      {/* Center: virtual value */}
      <View style={styles.centerGroup}>
        <Text style={styles.virtualLabel}>VIRTUAL</Text>
        <Text style={styles.totalValue}>${totalUsd.toFixed(2)}</Text>
      </View>

      {/* Right: PnL */}
      <View style={styles.rightGroup}>
        {isGain
          ? <TrendingUp size={12} color={GREEN} strokeWidth={2.5} />
          : <TrendingDown size={12} color={RED}  strokeWidth={2.5} />
        }
        <Text style={[styles.pnlAbsolute, { color: pnlColor }]}>
          {sign}${Math.abs(pnlAbsolute).toFixed(2)}
        </Text>
        <Text style={[styles.pnlPercent, { color: pnlColor }]}>
          ({sign}{Math.abs(pnlPercent).toFixed(2)}%)
        </Text>
      </View>

      <ChevronRight size={14} color={VIOLET} strokeWidth={2.5} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: VIOLET_DIM,
    borderBottomWidth: 1,
    borderBottomColor: VIOLET_BORDER,
    gap: 12,
  },

  // ── Left ──
  leftGroup: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 90 },
  dot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: VIOLET,
  },
  sandboxLabel: {
    color: VIOLET_LIGHT,
    fontSize: 10, fontWeight: "800", letterSpacing: 1.5,
  },

  // ── Center ──
  centerGroup: { flex: 1, alignItems: "center" },
  virtualLabel: {
    color: TEXT_MUTED,
    fontSize: 8, fontWeight: "700", letterSpacing: 1.2,
    marginBottom: 1,
  },
  totalValue: {
    color: TEXT_PRI,
    fontSize: 16, fontWeight: "800", letterSpacing: -0.5,
  },

  // ── Right ──
  rightGroup: { flexDirection: "row", alignItems: "center", gap: 4 },
  pnlAbsolute: { fontSize: 13, fontWeight: "700" },
  pnlPercent:  { fontSize: 11, fontWeight: "600" },
});
