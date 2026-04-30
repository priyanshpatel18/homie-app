import React from "react";
import {
  View, Text, Modal, Pressable, FlatList,
  StyleSheet, ActivityIndicator, TouchableOpacity,
} from "react-native";
import { fetchActivityLog } from "@homie/sdk";

const GLASS      = "rgba(255,255,255,0.06)";
const GLASS_BDR  = "rgba(255,255,255,0.10)";
const TEXT_PRI   = "#FFFFFF";
const TEXT_SEC   = "rgba(255,255,255,0.60)";
const TEXT_MUTED = "rgba(255,255,255,0.30)";
const GREEN      = "#4ADE80";
const WARN       = "#FBBF24";
const RED        = "#F87171";
const BLUE       = "#60A5FA";

const STATUS_CONFIG = {
  success:   { icon: "✓", color: GREEN,  label: "Done" },
  pending:   { icon: "◌", color: WARN,   label: "Pending" },
  failed:    { icon: "✕", color: RED,    label: "Failed" },
  cancelled: { icon: "–", color: TEXT_MUTED, label: "Cancelled" },
};

const TYPE_CONFIG = {
  auto_execute: { badge: "AUTO",       badgeColor: GREEN,  badgeBg: "rgba(74,222,128,0.12)" },
  user_action:  { badge: "MANUAL",     badgeColor: BLUE,   badgeBg: "rgba(96,165,250,0.10)" },
  alert:        { badge: "ALERT",      badgeColor: WARN,   badgeBg: "rgba(251,191,36,0.10)" },
  suggestion:   { badge: "SUGGESTED",  badgeColor: TEXT_MUTED, badgeBg: GLASS },
};

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ActivityEntry({ entry }) {
  const status = STATUS_CONFIG[entry.status] || STATUS_CONFIG.pending;
  const type   = TYPE_CONFIG[entry.type]    || TYPE_CONFIG.user_action;

  return (
    <View style={a.entry}>
      {/* Status icon */}
      <View style={[a.statusDot, { backgroundColor: `${status.color}18`, borderColor: `${status.color}30` }]}>
        <Text style={[a.statusIcon, { color: status.color }]}>{status.icon}</Text>
      </View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        <View style={a.entryTop}>
          <Text style={a.entryAction} numberOfLines={1}>{entry.action}</Text>
          <View style={[a.typeBadge, { backgroundColor: type.badgeBg }]}>
            <Text style={[a.typeBadgeText, { color: type.badgeColor }]}>{type.badge}</Text>
          </View>
        </View>

        {entry.reason && (
          <Text style={a.entryReason} numberOfLines={2}>{entry.reason}</Text>
        )}

        <View style={a.entryMeta}>
          <Text style={a.entryProtocol}>{entry.protocol}</Text>
          {entry.amountUsd != null && (
            <Text style={a.entryAmount}>${entry.amountUsd.toFixed(2)}</Text>
          )}
          <Text style={a.entryTime}>{timeAgo(entry.timestamp)}</Text>
        </View>
      </View>
    </View>
  );
}

export default function AgentActivitySheet({ visible, walletAddress, onClose }) {
  const [entries, setEntries] = React.useState([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!visible || !walletAddress) return;
    setLoading(true);
    fetchActivityLog(walletAddress, 50)
      .then((entries) => setEntries(entries ?? []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [visible, walletAddress]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={m.scrim} onPress={onClose} />
      <View style={m.sheet}>
        {/* Handle */}
        <View style={m.handle} />

        {/* Header */}
        <View style={m.header}>
          <View>
            <Text style={m.title}>Agent Activity</Text>
            <Text style={m.subtitle}>Everything the agent has done or suggested</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={m.closeBtn} activeOpacity={0.7}>
            <Text style={m.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Legend */}
        <View style={m.legend}>
          {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
            <View key={key} style={[m.legendItem, { backgroundColor: cfg.badgeBg }]}>
              <Text style={[m.legendText, { color: cfg.badgeColor }]}>{cfg.badge}</Text>
            </View>
          ))}
        </View>

        {/* List */}
        {loading ? (
          <View style={m.empty}>
            <ActivityIndicator color={GREEN} />
          </View>
        ) : entries.length === 0 ? (
          <View style={m.empty}>
            <Text style={m.emptyIcon}>📋</Text>
            <Text style={m.emptyTitle}>No activity yet</Text>
            <Text style={m.emptyDesc}>Actions taken by the agent or triggered by you will appear here.</Text>
          </View>
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(e) => e.id}
            renderItem={({ item }) => <ActivityEntry entry={item} />}
            contentContainerStyle={{ paddingBottom: 32 }}
            ItemSeparatorComponent={() => <View style={m.sep} />}
          />
        )}
      </View>
    </Modal>
  );
}

const m = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    backgroundColor: "rgb(8,13,9)",
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderWidth: 1, borderColor: GLASS_BDR, borderBottomWidth: 0,
    maxHeight: "85%",
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignSelf: "center", marginTop: 12, marginBottom: 4,
  },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    paddingHorizontal: 24, paddingTop: 16, paddingBottom: 12,
  },
  title: { color: TEXT_PRI, fontSize: 19, fontWeight: "800" },
  subtitle: { color: TEXT_MUTED, fontSize: 12, marginTop: 2 },
  closeBtn: {
    width: 30, height: 30, borderRadius: 9,
    backgroundColor: GLASS, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: GLASS_BDR,
  },
  closeBtnText: { color: TEXT_MUTED, fontSize: 13, fontWeight: "700" },
  legend: {
    flexDirection: "row", gap: 6, paddingHorizontal: 24, paddingBottom: 12, flexWrap: "wrap",
  },
  legendItem: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  legendText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  sep: { height: 1, backgroundColor: "rgba(255,255,255,0.05)", marginHorizontal: 24 },
  empty: { alignItems: "center", paddingVertical: 48, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 36, marginBottom: 12 },
  emptyTitle: { color: TEXT_SEC, fontSize: 16, fontWeight: "700", marginBottom: 6 },
  emptyDesc: { color: TEXT_MUTED, fontSize: 13, textAlign: "center", lineHeight: 19 },
});

const a = StyleSheet.create({
  entry: {
    flexDirection: "row", gap: 12,
    paddingHorizontal: 24, paddingVertical: 14,
  },
  statusDot: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, flexShrink: 0,
  },
  statusIcon: { fontSize: 14, fontWeight: "800" },
  entryTop: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 },
  entryAction: { color: TEXT_PRI, fontSize: 14, fontWeight: "700", flex: 1 },
  typeBadge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5,
  },
  typeBadgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  entryReason: { color: TEXT_SEC, fontSize: 12, lineHeight: 17, marginBottom: 5 },
  entryMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  entryProtocol: { color: TEXT_MUTED, fontSize: 11, fontWeight: "600" },
  entryAmount: { color: GREEN, fontSize: 11, fontWeight: "700" },
  entryTime: { color: TEXT_MUTED, fontSize: 11, marginLeft: "auto" },
});
