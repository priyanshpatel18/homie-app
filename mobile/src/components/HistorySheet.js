/**
 * HistorySheet — left-side drawer panel.
 * Slides in from the left edge like a navigation drawer.
 */

import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, Modal, TouchableOpacity, FlatList,
  StyleSheet, Animated, Dimensions, Pressable, Alert,
} from "react-native";
import { Linking } from "react-native";
import { MessageSquare, ArrowUpDown, Trash2, ExternalLink, Plus, X } from "lucide-react-native";
import {
  listConversations, deleteConversation, listTrades,
} from "../services/chatStorage";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const DRAWER_W = SCREEN_W * 0.82;

const GREEN      = "#4ADE80";
const GREEN_DIM  = "rgba(74,222,128,0.12)";
const GLASS      = "rgba(255,255,255,0.06)";
const GLASS_MED  = "rgba(255,255,255,0.09)";
const BORDER     = "rgba(255,255,255,0.10)";
const BORDER_LT  = "rgba(255,255,255,0.16)";
const TEXT_PRI   = "#FFFFFF";
const TEXT_SEC   = "rgba(255,255,255,0.58)";
const TEXT_MUTED = "rgba(255,255,255,0.28)";
const SHEET_BG   = "rgba(7,10,8,0.99)";

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const diffH = (Date.now() - d) / 3_600_000;
  if (diffH < 1)   return `${Math.max(1, Math.round(diffH * 60))}m ago`;
  if (diffH < 24)  return `${Math.round(diffH)}h ago`;
  if (diffH < 168) return `${Math.round(diffH / 24)}d ago`;
  return d.toLocaleDateString();
}

export default function HistorySheet({ visible, walletAddress, onClose, onLoadConversation, onNewChat }) {
  const [tab, setTab]             = useState("chats");
  const [conversations, setConversations] = useState([]);
  const [trades, setTrades]       = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const slideX   = useRef(new Animated.Value(-DRAWER_W)).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      loadData();
      Animated.parallel([
        Animated.spring(slideX,   { toValue: 0, useNativeDriver: true, tension: 85, friction: 13 }),
        Animated.timing(backdrop, { toValue: 1, useNativeDriver: true, duration: 240 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideX,   { toValue: -DRAWER_W, useNativeDriver: true, duration: 210 }),
        Animated.timing(backdrop, { toValue: 0,          useNativeDriver: true, duration: 200 }),
      ]).start();
    }
  }, [visible]);

  async function loadData() {
    if (!walletAddress) return;
    setRefreshing(true);
    const [convs, trds] = await Promise.all([
      listConversations(walletAddress),
      listTrades(walletAddress),
    ]);
    setConversations(convs);
    setTrades(trds);
    setRefreshing(false);
  }

  function handleDelete(id) {
    Alert.alert("Delete conversation", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        await deleteConversation(walletAddress, id);
        setConversations((prev) => prev.filter((c) => c.id !== id));
      }},
    ]);
  }

  function ConvItem({ item }) {
    return (
      <TouchableOpacity
        style={s.item}
        onPress={() => { onLoadConversation(item.id); onClose(); }}
        activeOpacity={0.75}
      >
        <View style={s.itemIcon}>
          <MessageSquare size={15} color={TEXT_SEC} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={s.itemTitleRow}>
            <Text style={s.itemTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={s.itemDate}>{formatDate(item.updatedAt)}</Text>
          </View>
          {item.preview ? <Text style={s.itemPreview} numberOfLines={1}>{item.preview}</Text> : null}
          <Text style={s.itemMeta}>{item.messageCount} message{item.messageCount !== 1 ? "s" : ""}</Text>
        </View>
        <TouchableOpacity
          style={s.actionBtn}
          onPress={() => handleDelete(item.id)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Trash2 size={14} color="rgba(248,113,113,0.50)" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }

  function TradeItem({ item }) {
    return (
      <View style={s.item}>
        <View style={[s.itemIcon, s.tradeIcon]}>
          <ArrowUpDown size={14} color={GREEN} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={s.itemTitleRow}>
            <Text style={s.itemTitle} numberOfLines={1}>{item.action}</Text>
            <Text style={s.itemDate}>{formatDate(item.executedAt)}</Text>
          </View>
          <Text style={s.itemPreview}>{item.protocol}{item.estimatedOutput ? ` · ${item.estimatedOutput}` : ""}</Text>
          {item.fee ? <Text style={s.itemMeta}>Fee: {item.fee}</Text> : null}
        </View>
        {item.signature && (
          <TouchableOpacity
            style={s.actionBtn}
            onPress={() => Linking.openURL(`https://solscan.io/tx/${item.signature}`)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ExternalLink size={13} color={TEXT_MUTED} />
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent>
      {/* Backdrop — tap to close */}
      <Animated.View style={[StyleSheet.absoluteFill, s.backdrop, { opacity: backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Drawer — slides in from left */}
      <Animated.View style={[s.drawer, { transform: [{ translateX: slideX }] }]}>

        {/* Drawer header */}
        <View style={s.drawerHeader}>
          <View>
            <Text style={s.drawerTitle}>History</Text>
            <Text style={s.drawerSub}>chats & trades</Text>
          </View>
          <View style={s.drawerHeaderRight}>
            <TouchableOpacity
              style={s.newBtn}
              onPress={() => { onNewChat(); onClose(); }}
              activeOpacity={0.8}
            >
              <Plus size={13} color="#000" />
              <Text style={s.newBtnText}>New Chat</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.closeBtn} onPress={onClose} activeOpacity={0.7}>
              <X size={16} color={TEXT_MUTED} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Tabs */}
        <View style={s.tabs}>
          {["chats", "trades"].map((t) => (
            <TouchableOpacity
              key={t}
              style={[s.tab, tab === t && s.tabActive]}
              onPress={() => setTab(t)}
              activeOpacity={0.8}
            >
              <Text style={[s.tabText, tab === t && s.tabTextActive]}>
                {t === "chats" ? "Chats" : "Trades"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* List */}
        {tab === "chats" && (
          <FlatList
            data={conversations}
            keyExtractor={(c) => c.id}
            renderItem={({ item }) => <ConvItem item={item} />}
            contentContainerStyle={s.listContent}
            onRefresh={loadData}
            refreshing={refreshing}
            ListEmptyComponent={<Text style={s.emptyText}>No saved conversations yet.</Text>}
          />
        )}
        {tab === "trades" && (
          <FlatList
            data={trades}
            keyExtractor={(t, i) => t.signature ?? String(i)}
            renderItem={({ item }) => <TradeItem item={item} />}
            contentContainerStyle={s.listContent}
            onRefresh={loadData}
            refreshing={refreshing}
            ListEmptyComponent={<Text style={s.emptyText}>No executed trades yet.</Text>}
          />
        )}
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  drawer: {
    position: "absolute",
    top: 0, left: 0, bottom: 0,
    width: DRAWER_W,
    backgroundColor: SHEET_BG,
    borderTopRightRadius: 24,
    borderBottomRightRadius: 24,
    borderRightWidth: 1,
    borderColor: BORDER_LT,
    shadowColor: "#000",
    shadowOffset: { width: 8, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 20,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  drawerTitle: { color: TEXT_PRI, fontSize: 20, fontWeight: "800" },
  drawerSub:   { color: TEXT_MUTED, fontSize: 12, marginTop: 2 },
  drawerHeaderRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  newBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: GREEN, borderRadius: 11,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  newBtnText: { color: "#000", fontSize: 13, fontWeight: "700" },
  closeBtn: {
    width: 32, height: 32, borderRadius: 9,
    backgroundColor: GLASS_MED,
    borderWidth: 1, borderColor: BORDER,
    alignItems: "center", justifyContent: "center",
  },
  tabs: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginVertical: 12,
    backgroundColor: GLASS,
    borderRadius: 12,
    borderWidth: 1, borderColor: BORDER,
    padding: 4,
  },
  tab:           { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 9 },
  tabActive:     { backgroundColor: GLASS_MED },
  tabText:       { color: TEXT_MUTED, fontSize: 14, fontWeight: "600" },
  tabTextActive: { color: TEXT_PRI },
  listContent:   { paddingHorizontal: 14, paddingBottom: 40, gap: 6 },
  item: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: GLASS,
    borderRadius: 14, borderWidth: 1, borderColor: BORDER,
    padding: 12,
  },
  itemIcon: {
    width: 32, height: 32, borderRadius: 9,
    backgroundColor: GLASS_MED, borderWidth: 1, borderColor: BORDER,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  tradeIcon: { backgroundColor: GREEN_DIM, borderColor: "rgba(74,222,128,0.18)" },
  itemTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  itemTitle:   { color: TEXT_PRI, fontSize: 13, fontWeight: "600", flex: 1, marginRight: 6 },
  itemDate:    { color: TEXT_MUTED, fontSize: 11, flexShrink: 0 },
  itemPreview: { color: TEXT_SEC, fontSize: 12, lineHeight: 16 },
  itemMeta:    { color: TEXT_MUTED, fontSize: 11 },
  actionBtn:   { width: 28, height: 28, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  emptyText:   { color: TEXT_MUTED, fontSize: 14, textAlign: "center", marginTop: 40 },
});
