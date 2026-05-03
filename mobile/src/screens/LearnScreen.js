import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { F } from "../theme/fonts";
import { fetchPortfolio } from "../services/api";
import { calcPortfolioUsd } from "../services/priceService";
import { getProgress, recordStreak } from "../services/progressService";
import PortfolioCard from "../components/PortfolioCard";
import LessonModal from "../components/LessonModal";
import TokenLearnCard from "../components/TokenLearnCard";

const GREEN  = "#4ADE80";
const BG     = "#000000";
const GLASS  = "rgba(255,255,255,0.06)";
const BORDER = "rgba(255,255,255,0.09)";
const MUTED  = "rgba(255,255,255,0.35)";
const SEC    = "rgba(255,255,255,0.55)";

// Lesson categories and their items — Day 2 will fill these with real modals
const LESSON_CATALOG = [
  {
    category: "BASICS",
    color: "#60A5FA",
    items: [
      { id: "what-is-sol",         emoji: "◎", title: "What is SOL?",             mins: 2, xp: 10 },
      { id: "what-is-wallet",      emoji: "👛", title: "What is a wallet?",        mins: 2, xp: 10 },
      { id: "what-is-transaction", emoji: "↗️", title: "What is a transaction?",   mins: 3, xp: 15 },
      { id: "what-is-token",       emoji: "🪙", title: "What is a token?",         mins: 2, xp: 10 },
    ],
  },
  {
    category: "SAVING & EARNING",
    color: GREEN,
    items: [
      { id: "what-is-staking",     emoji: "🔒", title: "What is staking?",         mins: 3, xp: 20 },
      { id: "liquid-staking",      emoji: "💧", title: "Liquid staking explained", mins: 4, xp: 25 },
      { id: "what-is-apy",         emoji: "📈", title: "How APY compounds",        mins: 3, xp: 20 },
      { id: "lst-explained",       emoji: "🌊", title: "mSOL, jitoSOL, INF — what's the difference?", mins: 4, xp: 25 },
      { id: "idle-sol",            emoji: "😴", title: "What idle SOL costs you",  mins: 2, xp: 15 },
    ],
  },
  {
    category: "LENDING & BORROWING",
    color: "#A78BFA",
    items: [
      { id: "what-is-kamino",      emoji: "🏦", title: "What is Kamino?",          mins: 3, xp: 25 },
      { id: "health-factor",       emoji: "❤️", title: "Health factor explained",  mins: 3, xp: 30 },
      { id: "borrow-safely",       emoji: "🛡️", title: "Borrow without selling",   mins: 4, xp: 30 },
    ],
  },
  {
    category: "TRADING",
    color: "#FBBF24",
    items: [
      { id: "what-is-dex",         emoji: "🔄", title: "What is a DEX?",           mins: 3, xp: 20 },
      { id: "what-is-slippage",    emoji: "📉", title: "What is slippage?",        mins: 2, xp: 20 },
      { id: "dca-strategy",        emoji: "⏰", title: "DCA: invest automatically", mins: 3, xp: 25 },
    ],
  },
  {
    category: "ADVANCED",
    color: "#F472B6",
    items: [
      { id: "what-is-leverage",    emoji: "🚀", title: "What is leverage?",        mins: 4, xp: 30 },
      { id: "impermanent-loss",    emoji: "⚠️", title: "Impermanent loss",         mins: 4, xp: 30 },
      { id: "what-is-playbook",    emoji: "🤖", title: "Automations & playbooks",  mins: 3, xp: 25 },
    ],
  },
];

// Today's featured lesson (Day 2: will be dynamic based on progress)
const TODAYS_LESSON = LESSON_CATALOG[1].items[1]; // liquid-staking

// ─── Streak dots (last 7 days) ────────────────────────────────────────────────

function StreakDots({ streak }) {
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  const today = new Date().getDay(); // 0=Sun
  // Mark the last `streak` days as active (simplified — Day 5 makes this precise)
  return (
    <View style={ss.streakDots}>
      {days.map((d, i) => {
        const active = i >= days.length - Math.min(streak, 7);
        return (
          <View key={i} style={ss.dotCol}>
            <View style={[ss.dot, active && ss.dotActive]} />
            <Text style={ss.dotLabel}>{d}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Today's lesson card ──────────────────────────────────────────────────────

function TodayCard({ lesson, onStart }) {
  return (
    <TouchableOpacity style={ss.todayCard} onPress={onStart} activeOpacity={0.88}>
      <View style={ss.todayLeft}>
        <Text style={ss.todayEmoji}>{lesson.emoji}</Text>
        <View style={ss.todayMeta}>
          <Text style={ss.todayLabel}>TODAY'S LESSON</Text>
          <Text style={ss.todayTitle}>{lesson.title}</Text>
          <Text style={ss.todayDetail}>{lesson.mins} min · +{lesson.xp} XP</Text>
        </View>
      </View>
      <View style={ss.startBtn}>
        <Text style={ss.startBtnText}>Start →</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Lesson row ───────────────────────────────────────────────────────────────

function LessonRow({ item, color, done, onPress }) {
  return (
    <TouchableOpacity style={ss.lessonRow} onPress={onPress} activeOpacity={0.8}>
      <View style={[ss.lessonDot, { backgroundColor: done ? color : "rgba(255,255,255,0.1)" }]}>
        <Text style={ss.lessonEmoji}>{done ? "✓" : item.emoji}</Text>
      </View>
      <View style={ss.lessonMid}>
        <Text style={[ss.lessonTitle, done && ss.lessonDone]}>{item.title}</Text>
        <Text style={ss.lessonDetail}>{item.mins} min</Text>
      </View>
      <View style={[ss.xpBadge, { backgroundColor: done ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.06)" }]}>
        <Text style={[ss.xpText, { color: done ? GREEN : MUTED }]}>
          {done ? "✓" : `+${item.xp}`} XP
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = ["Home", "Lessons", "Wallet"];

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function LearnScreen({ walletAddress, portfolio, onSwitchMode, onAskHomie }) {
  const [activeTab, setActiveTab]        = useState("Home");
  const [progress, setProgress]          = useState({ xp: 0, streak: 0, level: "Curious", completedLessons: [] });
  const [localPortfolio, setLocalPortfolio] = useState(portfolio ?? null);
  const [totalUsd, setTotalUsd]          = useState(null);
  const [loading, setLoading]            = useState(!portfolio);
  const [activeLessonId, setActiveLessonId] = useState(null);

  useEffect(() => {
    getProgress().then(setProgress).catch(() => {});
    recordStreak().catch(() => {});
  }, []);

  useEffect(() => {
    if (portfolio) { setLocalPortfolio(portfolio); setLoading(false); return; }
    if (!walletAddress) { setLoading(false); return; }
    fetchPortfolio(walletAddress)
      .then(async (p) => {
        setLocalPortfolio(p);
        const usd = await calcPortfolioUsd(p).catch(() => null);
        if (usd) setTotalUsd(usd.totalUsd);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [walletAddress]);

  const isDone = (id) => progress.completedLessons.includes(id);

  const openLesson = useCallback((id) => {
    setActiveLessonId(id);
  }, []);

  const handleLessonComplete = useCallback((id, xp) => {
    setProgress((prev) => ({
      ...prev,
      xp: prev.xp + xp,
      completedLessons: prev.completedLessons.includes(id)
        ? prev.completedLessons
        : [...prev.completedLessons, id],
    }));
  }, []);

  // Personalized suggestions based on portfolio (Day 3 makes these smart)
  const suggestions = [];
  if (localPortfolio) {
    const hasMsol = localPortfolio.positions?.some((p) => p.type === "liquid_stake");
    if (hasMsol && !isDone("lst-explained"))
      suggestions.push({ id: "lst-explained", label: "You hold mSOL — what is it?", emoji: "🌊", mins: 4 });
    if ((localPortfolio.solBalance ?? 0) > 0.01 && !isDone("liquid-staking"))
      suggestions.push({ id: "liquid-staking", label: "Your SOL can earn ~7% APY", emoji: "💧", mins: 4 });
    if (!isDone("what-is-staking"))
      suggestions.push({ id: "what-is-staking", label: "Start here: what is staking?", emoji: "🔒", mins: 3 });
  }

  // ── Home tab ────────────────────────────────────────────────────────────────
  function HomeTab() {
    const hour = new Date().getHours();
    const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={ss.tabScroll}>

        <Text style={ss.greeting}>{greet}.</Text>

        {/* Today's lesson */}
        <TodayCard lesson={TODAYS_LESSON} onStart={() => openLesson(TODAYS_LESSON.id)} />

        {/* Streak */}
        <View style={ss.section}>
          <View style={ss.sectionHeader}>
            <Text style={ss.sectionTitle}>Your streak</Text>
            <Text style={ss.streakCount}>🔥 {progress.streak} days</Text>
          </View>
          <StreakDots streak={progress.streak} />
        </View>

        {/* Mini wallet */}
        {localPortfolio && (
          <View style={ss.section}>
            <Text style={ss.sectionTitle}>Your wallet</Text>
            <View style={ss.walletSnap}>
              <Text style={ss.walletTotal}>
                {totalUsd != null ? `$${totalUsd.toFixed(2)}` : "—"}
              </Text>
              <Text style={ss.walletSub}>total balance</Text>
            </View>
          </View>
        )}

        {/* Personalized suggestions */}
        {suggestions.length > 0 && (
          <View style={ss.section}>
            <Text style={ss.sectionTitle}>For you</Text>
            {suggestions.slice(0, 3).map((sg) => (
              <TouchableOpacity key={sg.id} style={ss.suggRow} activeOpacity={0.8}
                onPress={() => openLesson(sg.id)}>
                <Text style={ss.suggEmoji}>{sg.emoji}</Text>
                <View style={ss.suggMid}>
                  <Text style={ss.suggLabel}>{sg.label}</Text>
                  <Text style={ss.suggDetail}>{sg.mins} min</Text>
                </View>
                <Text style={ss.suggArrow}>→</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

      </ScrollView>
    );
  }

  // ── Lessons tab ─────────────────────────────────────────────────────────────
  function LessonsTab() {
    // Show "YOUR WALLET" category if they have portfolio-specific lessons
    const walletCat = suggestions.length > 0 ? [{
      category: "YOUR WALLET",
      color: GREEN,
      items: suggestions.map((sg) => ({
        id: sg.id, emoji: sg.emoji, title: sg.label, mins: sg.mins, xp: 15,
      })),
    }] : [];

    const allCats = [...walletCat, ...LESSON_CATALOG];

    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={ss.tabScroll}>
        {allCats.map((cat) => (
          <View key={cat.category} style={ss.catBlock}>
            <View style={ss.catHeader}>
              <View style={[ss.catDot, { backgroundColor: cat.color }]} />
              <Text style={ss.catTitle}>{cat.category}</Text>
            </View>
            {cat.items.map((item) => (
              <LessonRow
                key={item.id}
                item={item}
                color={cat.color}
                done={isDone(item.id)}
                onPress={() => openLesson(item.id)}
              />
            ))}
          </View>
        ))}
        <View style={{ height: 32 }} />
      </ScrollView>
    );
  }

  // ── Wallet tab ──────────────────────────────────────────────────────────────
  function WalletTab() {
    if (loading) {
      return (
        <View style={ss.center}>
          <ActivityIndicator color={GREEN} />
          <Text style={ss.loadingText}>Loading your wallet...</Text>
        </View>
      );
    }
    if (!localPortfolio) {
      return (
        <View style={ss.center}>
          <Text style={ss.emptyEmoji}>👛</Text>
          <Text style={ss.emptyText}>No wallet data yet.</Text>
        </View>
      );
    }

    // Build a unified token list: staking positions first, then SPL tokens by USD value
    const positions = (localPortfolio.positions ?? []).map((p) => ({
      mint: p.mint ?? null,
      symbol: p.symbol,
      name: p.name,
      balance: p.lstBalance ?? p.balance,
      usdValue: p.usdValue ?? 0,
      logoUri: p.logoUri,
      isPosition: true,
    }));
    const tokens = (localPortfolio.tokens ?? []).map((t) => ({
      mint: t.mint,
      symbol: t.symbol,
      name: t.name,
      balance: t.balance,
      usdValue: t.usdValue ?? 0,
      logoUri: t.logoUri,
    }));
    const solToken = {
      mint: null,
      symbol: "SOL",
      name: "Solana",
      solBalance: localPortfolio.solBalance ?? 0,
      usdValue: localPortfolio.solUsdValue ?? (localPortfolio.solBalance ?? 0) * 150,
    };
    const allTokens = [
      ...positions,
      ...(localPortfolio.solBalance > 0.001 ? [solToken] : []),
      ...tokens.sort((a, b) => b.usdValue - a.usdValue),
    ];

    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={ss.tabScroll}>
        <Text style={ss.walletTabTitle}>Your tokens</Text>
        <Text style={ss.walletTabSub}>Tap any token to understand what it is.</Text>
        {allTokens.map((tok, i) => (
          <TokenLearnCard
            key={tok.mint ?? "sol-" + i}
            token={tok}
            onLearnMore={(lessonId) => openLesson(lessonId)}
            onAskHomie={(msg) => {
              onSwitchMode?.();
              setTimeout(() => onAskHomie?.(msg), 400);
            }}
          />
        ))}
        {allTokens.length === 0 && (
          <Text style={ss.emptyText}>No tokens found in this wallet.</Text>
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    );
  }

  return (
    <View style={ss.root}>

      {/* ── Header ── */}
      <SafeAreaView edges={["top"]} style={ss.header}>
        <View style={ss.headerLeft}>
          <Text style={ss.headerXp}>⚡ {progress.xp} XP</Text>
          <Text style={ss.headerStreak}>🔥 {progress.streak}</Text>
          <View style={ss.levelPill}>
            <Text style={ss.levelText}>{progress.level}</Text>
          </View>
        </View>
        <TouchableOpacity style={ss.switchBtn} onPress={onSwitchMode} activeOpacity={0.8}>
          <Text style={ss.switchBtnText}>Pro mode ⚡</Text>
        </TouchableOpacity>
      </SafeAreaView>

      {/* ── Tab content ── */}
      <View style={ss.content}>
        {activeTab === "Home"    && <HomeTab />}
        {activeTab === "Lessons" && <LessonsTab />}
        {activeTab === "Wallet"  && <WalletTab />}
      </View>

      {/* ── Bottom tab bar ── */}
      <SafeAreaView edges={["bottom"]} style={ss.tabBar}>
        {TABS.map((tab) => {
          const active = activeTab === tab;
          const icon   = tab === "Home" ? "🏠" : tab === "Lessons" ? "📚" : "👛";
          return (
            <TouchableOpacity
              key={tab}
              style={ss.tabItem}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
            >
              <Text style={[ss.tabIcon, active && ss.tabIconActive]}>{icon}</Text>
              <Text style={[ss.tabLabel, active && ss.tabLabelActive]}>{tab}</Text>
            </TouchableOpacity>
          );
        })}
      </SafeAreaView>

      {/* ── Lesson modal ── */}
      <LessonModal
        lessonId={activeLessonId}
        portfolio={localPortfolio}
        visible={activeLessonId !== null}
        onClose={() => setActiveLessonId(null)}
        onComplete={handleLessonComplete}
        onOpenLesson={(id) => {
          setActiveLessonId(null);
          setTimeout(() => setActiveLessonId(id), 350);
        }}
      />

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  root:    { flex: 1, backgroundColor: BG },
  content: { flex: 1 },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor: BG,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerXp:   { color: "#FBBF24", fontSize: 14, fontFamily: F.headSemi },
  headerStreak: { color: "#F87171", fontSize: 14, fontFamily: F.headSemi },
  levelPill: {
    backgroundColor: "rgba(74,222,128,0.12)",
    borderRadius: 20, borderWidth: 1,
    borderColor: "rgba(74,222,128,0.25)",
    paddingHorizontal: 10, paddingVertical: 3,
  },
  levelText: { color: GREEN, fontSize: 11, fontFamily: F.headSemi, letterSpacing: 0.3 },

  switchBtn: {
    backgroundColor: GLASS,
    borderRadius: 20, borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  switchBtnText: { color: SEC, fontSize: 13, fontFamily: F.medium },

  // Tab bar
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1, borderTopColor: BORDER,
    backgroundColor: BG,
  },
  tabItem:  { flex: 1, alignItems: "center", paddingVertical: 10, gap: 3 },
  tabIcon:  { fontSize: 20, opacity: 0.4 },
  tabIconActive: { opacity: 1 },
  tabLabel: { color: MUTED, fontSize: 11, fontFamily: F.medium },
  tabLabelActive: { color: "#fff" },

  // Tab scroll content
  tabScroll: { paddingHorizontal: 20, paddingTop: 20 },

  // Home tab
  greeting: {
    color: "#fff", fontSize: 28,
    fontFamily: F.headBold, letterSpacing: -0.5,
    marginBottom: 20,
  },

  todayCard: {
    backgroundColor: "rgba(74,222,128,0.08)",
    borderRadius: 20, borderWidth: 1,
    borderColor: "rgba(74,222,128,0.2)",
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  todayLeft:   { flexDirection: "row", alignItems: "center", gap: 14, flex: 1 },
  todayEmoji:  { fontSize: 32 },
  todayMeta:   { flex: 1, gap: 3 },
  todayLabel:  { color: "rgba(74,222,128,0.6)", fontSize: 10, fontFamily: F.headSemi, letterSpacing: 1.2 },
  todayTitle:  { color: "#fff", fontSize: 15, fontFamily: F.headSemi },
  todayDetail: { color: MUTED, fontSize: 12, fontFamily: F.regular },
  startBtn: {
    backgroundColor: GREEN,
    borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  startBtnText: { color: "#000", fontSize: 13, fontFamily: F.headBold },

  section:      { marginBottom: 24 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle:  { color: SEC, fontSize: 12, fontFamily: F.headSemi, letterSpacing: 0.8, textTransform: "uppercase" },
  streakCount:   { color: "#F87171", fontSize: 13, fontFamily: F.medium },

  streakDots: { flexDirection: "row", gap: 8 },
  dotCol:     { alignItems: "center", gap: 5 },
  dot:        { width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: BORDER },
  dotActive:  { backgroundColor: "rgba(248,113,113,0.25)", borderColor: "#F87171" },
  dotLabel:   { color: MUTED, fontSize: 10, fontFamily: F.medium },

  walletSnap: {
    backgroundColor: GLASS, borderRadius: 16, borderWidth: 1, borderColor: BORDER,
    padding: 20, alignItems: "center", gap: 4,
  },
  walletTotal: { color: "#fff", fontSize: 32, fontFamily: F.headBold, letterSpacing: -1 },
  walletSub:   { color: MUTED, fontSize: 12, fontFamily: F.regular },

  suggRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: GLASS, borderRadius: 14, borderWidth: 1, borderColor: BORDER,
    padding: 14, marginBottom: 8,
  },
  suggEmoji:  { fontSize: 22 },
  suggMid:    { flex: 1, gap: 2 },
  suggLabel:  { color: "#fff", fontSize: 14, fontFamily: F.medium },
  suggDetail: { color: MUTED, fontSize: 12, fontFamily: F.regular },
  suggArrow:  { color: MUTED, fontSize: 16 },

  // Lessons tab
  catBlock: { marginBottom: 28 },
  catHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  catDot:    { width: 8, height: 8, borderRadius: 4 },
  catTitle:  { color: MUTED, fontSize: 11, fontFamily: F.headSemi, letterSpacing: 1 },

  lessonRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 12, paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER,
  },
  lessonDot: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },
  lessonEmoji: { fontSize: 16 },
  lessonMid:   { flex: 1, gap: 2 },
  lessonTitle: { color: "#fff", fontSize: 14, fontFamily: F.medium },
  lessonDone:  { color: MUTED, textDecorationLine: "line-through" },
  lessonDetail: { color: MUTED, fontSize: 12, fontFamily: F.regular },
  xpBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  xpText:  { fontSize: 12, fontFamily: F.medium },

  // Wallet tab
  walletTabTitle: { color: "#fff", fontSize: 22, fontFamily: F.headBold, marginBottom: 4 },
  walletTabSub:   { color: MUTED, fontSize: 13, fontFamily: F.regular, marginBottom: 16 },

  // States
  center:      { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: MUTED, fontSize: 14, fontFamily: F.regular },
  emptyEmoji:  { fontSize: 40 },
  emptyText:   { color: MUTED, fontSize: 15, fontFamily: F.regular },
});
