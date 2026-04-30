import React, { useEffect, useState } from "react";
import {
  View, Text, Modal, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator,
} from "react-native";
import { fetchPositions, closeTrackedPosition } from "../services/notifications";

const GLASS       = "rgba(255,255,255,0.07)";
const GLASS_MED   = "rgba(255,255,255,0.10)";
const GLASS_BDR   = "rgba(255,255,255,0.12)";
const GLASS_BDR_L = "rgba(255,255,255,0.18)";
const TEXT_PRI    = "#FFFFFF";
const TEXT_SEC    = "rgba(255,255,255,0.65)";
const TEXT_MUTED  = "rgba(255,255,255,0.35)";
const GREEN       = "#4ADE80";
const RED         = "#F87171";

const ACTION_COLORS = { stake: "#4ADE80", lend: "#60A5FA", lp: "#FBBF24" };

function timeAgo(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (days  > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins  > 0) return `${mins}m ago`;
  return "just now";
}

export default function PositionsSheet({ visible, walletAddress, onClose }) {
  const [positions, setPositions] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [closing, setClosing]     = useState(null); // positionId being closed

  useEffect(() => {
    if (!visible || !walletAddress) return;
    setLoading(true);
    fetchPositions(walletAddress)
      .then(setPositions)
      .finally(() => setLoading(false));
  }, [visible, walletAddress]);

  async function handleClose(positionId) {
    setClosing(positionId);
    await closeTrackedPosition(walletAddress, positionId);
    setPositions((prev) => prev.filter((p) => p.id !== positionId));
    setClosing(null);
  }

  function renderPosition({ item }) {
    const actionColor = ACTION_COLORS[item.action] || TEXT_MUTED;
    const isClosing   = closing === item.id;

    return (
      <View style={styles.posCard}>
        <View style={styles.posHeader}>
          <View style={[styles.actionBadge, { borderLeftColor: actionColor }]}>
            <View style={[styles.actionDot, { backgroundColor: actionColor }]} />
            <Text style={[styles.actionText, { color: actionColor }]}>
              {item.action?.toUpperCase() ?? "—"}
            </Text>
          </View>
          <Text style={styles.posTime}>{timeAgo(item.createdAt)}</Text>
        </View>

        <Text style={styles.posProtocol}>{item.protocol}</Text>
        {item.pair && item.pair !== item.protocol && (
          <Text style={styles.posPair}>{item.pair}</Text>
        )}

        <View style={styles.posFooter}>
          {item.amountUsd > 0 && (
            <Text style={styles.posAmount}>${item.amountUsd.toFixed(0)} deployed</Text>
          )}
          <TouchableOpacity
            style={[styles.closeBtn, isClosing && { opacity: 0.5 }]}
            onPress={() => handleClose(item.id)}
            disabled={isClosing}
          >
            {isClosing
              ? <ActivityIndicator size="small" color={TEXT_MUTED} />
              : <Text style={styles.closeBtnText}>Stop tracking</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Active Positions</Text>
              <Text style={styles.subtitle}>Homie is watching these for you</Text>
            </View>
            <TouchableOpacity style={styles.closeSheetBtn} onPress={onClose}>
              <Text style={styles.closeSheetText}>Done</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {loading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={GREEN} />
            </View>
          ) : positions.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>nothing being tracked yet</Text>
              <Text style={styles.emptyBody}>
                when you execute a trade, Homie will watch it and alert you if something looks off.
              </Text>
            </View>
          ) : (
            <FlatList
              data={positions}
              keyExtractor={(item) => item.id}
              renderItem={renderPosition}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#111",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 40,
    maxHeight: "75%",
    borderWidth: 1,
    borderColor: GLASS_BDR_L,
    borderBottomWidth: 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
  },
  title:    { color: TEXT_PRI,  fontSize: 18, fontWeight: "800" },
  subtitle: { color: TEXT_MUTED, fontSize: 13, marginTop: 3 },
  closeSheetBtn: {
    backgroundColor: GLASS_MED,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: GLASS_BDR,
  },
  closeSheetText: { color: TEXT_SEC, fontSize: 14, fontWeight: "700" },
  divider: { height: 1, backgroundColor: GLASS_BDR, marginHorizontal: 24 },
  list: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },

  posCard: {
    backgroundColor: GLASS,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: GLASS_BDR,
  },
  posHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  actionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: GLASS_BDR,
    borderLeftWidth: 3,
  },
  actionDot:  { width: 7, height: 7, borderRadius: 4 },
  actionText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  posTime:    { color: TEXT_MUTED, fontSize: 12 },
  posProtocol:{ color: TEXT_PRI,  fontSize: 16, fontWeight: "700", marginBottom: 2 },
  posPair:    { color: TEXT_SEC,  fontSize: 13, marginBottom: 8 },
  posFooter:  {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  posAmount: { color: TEXT_MUTED, fontSize: 13 },
  closeBtn: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.25)",
    backgroundColor: "rgba(248,113,113,0.08)",
  },
  closeBtnText: { color: RED, fontSize: 13, fontWeight: "700" },

  empty: {
    paddingVertical: 60,
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyTitle: {
    color: TEXT_SEC,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 10,
    textAlign: "center",
  },
  emptyBody: {
    color: TEXT_MUTED,
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
  },
});
