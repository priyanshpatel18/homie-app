import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  FlatList,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
} from "react-native";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { Layers, ChevronDown, ChevronUp, Mic } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePrivy, useEmbeddedSolanaWallet } from "@privy-io/expo";
import { Connection, PublicKey, LAMPORTS_PER_SOL, VersionedTransaction, Keypair } from "@solana/web3.js";
import { Buffer } from "buffer";
import * as SecureStore from "expo-secure-store";
import { IMPORTED_KEY_STORE, IMPORTED_ADDR_STORE, walletImportSignal } from "../components/LoginSheet";
import StrategyCard from "../components/StrategyCard";
import TokenStatsCard from "../components/TokenStatsCard";
import SentimentCard from "../components/SentimentCard";
import CrossVenueCard from "../components/CrossVenueCard";
import SlideToConfirm from "../components/SlideToConfirm";
import TransactionPreview from "../components/TransactionPreview";
import SkiaGlowBackground from "../components/SkiaGlowBackground";
import SkiaHeaderCard from "../components/SkiaHeaderCard";
import GlowBubble from "../components/GlowBubble";
import SkiaSendButton from "../components/SkiaSendButton";
import PortfolioCard from "../components/PortfolioCard";
import PnLCard from "../components/PnLCard";
import HistorySheet from "../components/HistorySheet";
import PositionsSheet from "../components/PositionsSheet";
import RiskSnapshotCard from "../components/RiskSnapshotCard";
import ProjectionCard from "../components/ProjectionCard";
import OnboardingSheet, { shouldShowOnboarding, getSavedTradeMode } from "../components/OnboardingSheet";
import HomieLogoMain from "../components/HomieLogoMain";
import HomieLogoThinking from "../components/HomieLogoThinking";
import SandboxBanner from "../components/SandboxBanner";
import SandboxDashboard from "../components/SandboxDashboard";
import VoiceInputBubble from "../components/VoiceInputBubble";
import ReceiveSheet from "../components/ReceiveSheet";
import { InlineWalletQR } from "../components/ReceiveSheet";
import MultiplyCard from "../components/MultiplyCard";
import PlaybookCard from "../components/PlaybookCard";
import Markdown from "react-native-markdown-display";
import { F } from "../theme/fonts";
import Svg, { Text as SvgText, Defs, LinearGradient as SvgLinearGradient, Stop } from "react-native-svg";
import { askHomieStream, fetchPortfolio } from "../services/api";
import { getAccessToken } from "@privy-io/expo";
import { setAuthToken } from "../services/authStore";
import { loadProfile } from "../services/userProfile";
import { loadConfirmThreshold, saveConfirmThreshold } from "../services/confirmSettings";
import RiskProfileSheet from "../components/RiskProfileSheet";
import { loadAutopilot, autopilotToContext } from "../services/autopilotService";
import AutopilotSheet from "../components/AutopilotSheet";
import {
  registerForPushNotifications,
  registerPushToken,
  registerPosition,
  addNotificationListeners,
} from "../services/notifications";
import {
  newConversationId,
  saveConversation,
  loadConversation,
  saveTrade,
  listTrades,
  loadLatestHistory,
} from "../services/chatStorage";
import { saveConversationEmbedding, buildMemoryContext } from "../services/embeddingCache";
import { tradeInsightText } from "../services/pnlService";
import { useInputSuggestion, recordUserQuery } from "../hooks/useInputSuggestion";
import { calcPortfolioUsd, fetchPricesForMints } from "../services/priceService";
import { loadPortfolioCache, savePortfolioCache } from "../services/portfolioCache";
import {
  loadSandboxState, saveSandboxState, resetSandboxState, createFreshState,
  simulateSwap, simulateStake, simulateUnstake, updateYield,
  simulateLend, simulateWithdrawLend, simulateLeverage, simulateLpOpen,
  calculatePnL, fetchTokenPricesUsd, parseTxAction,
} from "@homie/sandbox";

const SOLANA_RPCS = {
  mainnet: "https://api.mainnet-beta.solana.com",
  devnet:  "https://api.devnet.solana.com",
};

// ─── Palette ───
const BLACK            = "#000000";
const SURFACE          = "#0A0A0A";              // Slightly lifted surface
const GLASS            = "rgba(255,255,255,0.06)";
const GLASS_MED        = "rgba(255,255,255,0.09)";
const GLASS_HEAVY      = "rgba(255,255,255,0.13)";
const GLASS_BORDER     = "rgba(255,255,255,0.10)";
const ACCENT           = "#FFFFFF";
const TEXT_PRI         = "#FFFFFF";
const TEXT_SEC         = "rgba(255,255,255,0.70)";   // Raised from 0.65
const TEXT_MUTED       = "rgba(255,255,255,0.35)";
const GREEN            = "#4ADE80";
const WARN             = "#FBBF24";

// Tx risk classification — these always show the confirmation modal regardless of threshold
function isHighRiskTx(tx) {
  const action   = (tx?.action   || "").toLowerCase();
  const protocol = (tx?.protocol || "").toLowerCase();
  return (
    action.includes("leverage") || action.includes("multiply") ||
    action.includes(" lp ")    || action.includes("liquidity") ||
    action.includes("dca")     || action.includes("limit order") ||
    action.includes("oco")     || protocol.includes("multiply")
  );
}

// ─── Time-aware loading message pools (no emojis) ───────────────────────────
// Fast (0-4 s): quick, punchy, absurd
const MSG_FAST = [
  "bribing the validators with pizza...",
  "waking up the blockchain hamsters...",
  "shaking the magic 8-ball for alpha...",
  "asking the wifi gods for permission...",
  "warming up my crystal ball...",
  "counting backwards from infinity...",
  "feeding the protocol pigeons...",
  "stretching before this heavy lifting...",
  "putting on my reading glasses...",
  "summoning the liquidity spirits...",
  "consulting the ancient DeFi scrolls...",
  "dusting off the abacus...",
  "loading snacks for the validators...",
  "tuning the blockchain frequencies...",
  "asking the blockchain very politely...",
  "reticulating the splines...",
  "inflating the gas bags...",
  "training a goldfish to read charts...",
  "photosynthesizing some data...",
  "booting up the money printer...",
];

// Medium (4-10 s): funnier, more absurd
const MSG_MEDIUM = [
  "arm wrestling an RPC node for your data...",
  "convincing solana this isn't a rug pull...",
  "hacking into the mainframe... jk jk...",
  "playing rock paper scissors with jupiter...",
  "translating whale language, they're noisy today...",
  "negotiating a peace treaty between bulls and bears...",
  "my pet blockchain is being dramatic again...",
  "debugging the matrix, found a typo...",
  "teaching validators to do the macarena...",
  "speed-reading the entire blockchain history...",
  "the pools are playing hard to get...",
  "recalibrating my crystal ball, it's been moody...",
  "untangling the spaghetti code with chopsticks...",
  "waiting for mercury to exit retrograde...",
  "giving the smart contracts a pep talk...",
  "alphabetizing the tokens by vibes...",
  "the blockchain is doing yoga, needs to stretch...",
  "convincing the API I'm not a bot... oh wait...",
  "interviewing each validator personally...",
  "folding blockchain origami, almost there...",
];

// Slow (10+ s): self-aware, dramatic, still funny
const MSG_SLOW = [
  "even snails are judging me right now...",
  "the validators are having a union meeting...",
  "I could've staked SOL and earned yield by now...",
  "plotting world domination while we wait...",
  "started writing my memoirs at this point...",
  "the blockchain went for a coffee break, apparently...",
  "contemplating the meaning of decentralization...",
  "building a time machine to get this faster...",
  "this is taking longer than an ETH transaction...",
  "the RPC node is on a lunch break, hold tight...",
  "reorganizing my bookshelf while I wait too...",
  "fun fact: light travels 3M km per second. we are not light...",
  "I blame mercury retrograde for this one...",
  "patience is a virtue, but this is testing mine...",
  "somewhere, a validator sneezed and we're paying for it...",
];

const seenFast   = new Set();
const seenMed    = new Set();
const seenSlow   = new Set();

function pickUnique(pool, seen) {
  if (seen.size >= pool.length) seen.clear();
  let idx;
  do { idx = Math.floor(Math.random() * pool.length); } while (seen.has(idx));
  seen.add(idx);
  return pool[idx];
}

// Animated SVG LinearGradient — gradient colors live on the text fill directly
const AnimatedSvgLinearGradient = Animated.createAnimatedComponent(SvgLinearGradient);
const TEXT_SHIMMER_W = 280;

// ─── Message tone detection ───────────────────────────────────────────────────
function detectTone(text) {
  if (!text) return "neutral";
  const t = text.toLowerCase();
  if (t.match(/confirmed|✓|success|broadcast|staked|deposited|swapped|executed/)) return "success";
  if (t.match(/risk|careful|warning|volatile|dangerous|liquidat|lose|crash|avoid/)) return "warning";
  if (t.match(/\$[0-9]|price|apy|earn|yield|up|rally|bull|profit|gain/)) return "positive";
  return "neutral";
}

// ─── Contextual follow-up chips ──────────────────────────────────────────────
const CHIP_SETS = {
  price:     ["How's that vs last week?", "Show my exposure", "Move 20% to yield", "Set TP/SL for my SOL"],
  portfolio: ["Rebalance my portfolio", "What if SOL drops 40%?", "Best yield for my balance", "Protect my portfolio"],
  yield:     ["What's the risk?", "Compare options", "How much would I earn?", "Execute this"],
  trade:     ["Check the fees", "Best route?", "Show my portfolio", "What if this trade goes wrong?"],
  warning:   ["Safe alternatives", "Reduce my exposure", "Explain this risk", "What's the worst case?"],
  success:   ["Rebalance my portfolio", "Find more yield", "DCA $50/week into SOL", "Show my portfolio"],
  rebalance: ["Execute the rebalance", "Explain each step", "What's the risk?", "Skip for now"],
};

function getContextualChips(messages) {
  const last = [...messages].reverse().find(m => m.role === "homie" && m.id !== "welcome");
  if (!last?.text) return null;
  const t = last.text.toLowerCase();
  if (t.match(/rebalanc|allocation|on target|drift|off.?target/))        return CHIP_SETS.rebalance;
  if (t.match(/confirmed|✓|success|staked|deposited|swapped|executed/)) return CHIP_SETS.success;
  if (t.match(/risk|careful|warning|volatile|liquidat|avoid/))           return CHIP_SETS.warning;
  if (t.match(/swap|trade|buy|sell|jupiter/))                            return CHIP_SETS.trade;
  if (t.match(/yield|apy|stake|lend|kamino|marinade|earn/))              return CHIP_SETS.yield;
  if (t.match(/portfolio|balance|worth|holding|wallet/))                 return CHIP_SETS.portfolio;
  if (t.match(/price|sol is|trading at|\$[0-9]/))                        return CHIP_SETS.price;
  return null;
}

// ─── Premium tone accent on message bubble ───────────────────────────────────
function ToneAccent({ tone }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (tone === "neutral") return;
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(opacity, { toValue: 0.35, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  if (tone === "neutral") return null;
  const color = tone === "success" ? "#4ADE80" : tone === "warning" ? "#FBBF24" : "#4ADE80";

  return (
    <Animated.View style={{
      position: "absolute", left: 0, top: 8, bottom: 8,
      width: 2, borderRadius: 2,
      backgroundColor: color,
      opacity,
    }} />
  );
}

function TypingIndicator({ status = "" }) {
  const [message, setMessage] = useState(() => pickUnique(MSG_FAST, seenFast));
  const shimmerX   = useRef(new Animated.Value(0)).current;
  const startRef   = useRef(Date.now());

  useEffect(() => {
    Animated.loop(
      Animated.timing(shimmerX, {
        toValue: 1,
        duration: 1800,
        easing: Easing.linear,
        useNativeDriver: false,
      })
    ).start();

    const rotate = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const pool = elapsed < 4000 ? MSG_FAST : elapsed < 10000 ? MSG_MEDIUM : MSG_SLOW;
      const seen = elapsed < 4000 ? seenFast  : elapsed < 10000 ? seenMed   : seenSlow;
      setMessage(pickUnique(pool, seen));
    }, 2200);

    return () => { shimmerX.stopAnimation(); clearInterval(rotate); };
  }, []);

  const x1 = shimmerX.interpolate({ inputRange: [0, 1], outputRange: [-TEXT_SHIMMER_W, TEXT_SHIMMER_W] });
  const x2 = shimmerX.interpolate({ inputRange: [0, 1], outputRange: [0, TEXT_SHIMMER_W * 2] });

  // When the agent is actively calling a tool, show that status instead of the random quip
  const displayText = status || message;

  return (
    <View style={[styles.shimmerRow, { opacity: 0.45 }]}>
      <HomieLogoThinking size={22} />
      <Svg width={TEXT_SHIMMER_W} height={26}>
        <Defs>
          <AnimatedSvgLinearGradient
            id="typingTextShimmer"
            x1={x1}
            x2={x2}
            y1={0}
            y2={0}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0"    stopColor="#4ADE80" />
            <Stop offset="0.30" stopColor="#4ADE80" />
            <Stop offset="0.46" stopColor="#111111" />
            <Stop offset="0.54" stopColor="#FFFFFF" />
            <Stop offset="0.70" stopColor="#4ADE80" />
            <Stop offset="1"    stopColor="#4ADE80" />
          </AnimatedSvgLinearGradient>
        </Defs>
        <SvgText
          fill="url(#typingTextShimmer)"
          fontSize={16}
          fontWeight="500"
          x={0}
          y={20}
        >
          {displayText}
        </SvgText>
      </Svg>
    </View>
  );
}

function HomieAvatar() {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.08,
          duration: 2500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 2500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View style={[styles.avatar, { transform: [{ scale: pulse }] }]}>
      <HomieLogoMain size={32} />
    </Animated.View>
  );
}

// Wallet-state-aware suggested prompts — match the user's actual situation
function getQuickSuggestions(solBalance) {
  if (solBalance == null || solBalance <= 0.001) {
    // Empty wallet: beginner-friendly, educational
    return [
      "How do I get started?",
      "What is staking?",
      "Show me what's possible with $100",
    ];
  }
  // Has some balance: practical next-step prompts
  return [
    "What should I do with my SOL?",
    "Explain yield farming in 30 seconds",
    "What are the safest ways to earn?",
    "Show me my portfolio",
  ];
}

function buildWelcome(solBalance, walletAddress, walletStatus) {
  if (walletAddress && solBalance !== null) {
    if (solBalance <= 0.001) {
      return {
        id: "welcome",
        role: "homie",
        text: "Hey \u2014 your wallet is empty right now. Before we do anything, want me to explain how DeFi earning works in 30 seconds? Or if you already know, tell me what you want to do.",
        strategies: [],
        showWalletQR: true,
      };
    }
    return {
      id: "welcome",
      role: "homie",
      text: `Hey \u2014 you have ${solBalance.toFixed(4)} SOL. I can help you find the best yields, protect your portfolio, or just answer questions about what's happening on-chain. What would you like to do?`,
      strategies: [],
    };
  }
  return {
    id: "welcome",
    role: "homie",
    text: "Setting up your Solana wallet. One moment...",
    strategies: [],
  };
}

// ─── StrategyCardStack — shows primary card prominently, rest collapsible ────
function StrategyCardStack({ strategies, walletAddress, onTransactionReady, onExecuteStrategy }) {
  const [expanded, setExpanded] = useState(false);
  const primary  = strategies[0];
  const rest     = strategies.slice(1);

  return (
    <View>
      <StrategyCard
        strategy={primary}
        index={0}
        isPrimary
        walletAddress={walletAddress}
        onTransactionReady={onTransactionReady}
        onExecuteStrategy={onExecuteStrategy}
      />
      {rest.length > 0 && !expanded && (
        <TouchableOpacity
          style={stackStyles.seeMore}
          onPress={() => setExpanded(true)}
          activeOpacity={0.75}
        >
          <Text style={stackStyles.seeMoreText}>
            {rest.length} more option{rest.length > 1 ? "s" : ""} ↓
          </Text>
        </TouchableOpacity>
      )}
      {expanded && rest.map((strategy, i) => (
        <StrategyCard
          key={i + 1}
          strategy={strategy}
          index={i + 1}
          isPrimary={false}
          walletAddress={walletAddress}
          onTransactionReady={onTransactionReady}
          onExecuteStrategy={onExecuteStrategy}
        />
      ))}
      {expanded && rest.length > 0 && (
        <TouchableOpacity
          style={stackStyles.seeMore}
          onPress={() => setExpanded(false)}
          activeOpacity={0.75}
        >
          <Text style={stackStyles.seeMoreText}>Show less ↑</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const stackStyles = StyleSheet.create({
  seeMore: {
    alignSelf: "center",
    marginTop: 10,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  seeMoreText: {
    color: "rgba(255,255,255,0.50)",
    fontSize: 13,
    fontFamily: F.semibold,
  },
});

export default function ChatScreen({ route, navigation }) {
  const { logout: privyLogout, authenticated: privyAuthenticated } = usePrivy();

  async function logout() {
    const tasks = [
      SecureStore.deleteItemAsync(IMPORTED_KEY_STORE),
      SecureStore.deleteItemAsync(IMPORTED_ADDR_STORE),
      SecureStore.deleteItemAsync("homie_passcode"),
    ];
    if (privyAuthenticated) tasks.push(privyLogout());
    await Promise.allSettled(tasks);
    // Tell App.js to clear importedAddress and return to onboarding
    walletImportSignal.emit(null);
  }
  const solanaWalletState = useEmbeddedSolanaWallet();

  const walletStatus = solanaWalletState?.status;
  const privyAddress = solanaWalletState?.wallets?.[0]?.address ?? null;

  // Imported private-key wallet takes precedence over Privy embedded wallet
  const [importedAddress, setImportedAddress] = useState(null);
  useEffect(() => {
    SecureStore.getItemAsync(IMPORTED_ADDR_STORE).then((addr) => {
      if (addr) setImportedAddress(addr);
    });
  }, []);

  const walletAddress = importedAddress ?? privyAddress;

  const suggestion = useInputSuggestion(input, walletAddress);

  const [solBalance, setSolBalance]         = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [portfolio, setPortfolio]           = useState(null);
  const [messages, setMessages]             = useState([buildWelcome(null, null, walletStatus)]);
  const [input, setInput]                   = useState("");
  const [loading, setLoading]               = useState(false);
  const [agentStatus, setAgentStatus]       = useState("");
  const [confirmThresholdUsd, setConfirmThresholdUsd] = useState(null); // null = always confirm
  const [network, setNetwork]                         = useState("mainnet");
  const [conversationHistory, setConversationHistory] = useState([]);
  const [pendingTx, setPendingTx]           = useState(null);
  const [historyVisible, setHistoryVisible]       = useState(false);
  const [positionsVisible, setPositionsVisible]   = useState(false);
  const [onboardingVisible, setOnboardingVisible] = useState(false);
  const [currentConvId, setCurrentConvId]         = useState(() => newConversationId());
  const [portfolioUsd, setPortfolioUsd]           = useState(null); // total USD, live mode
  const [solPrice, setSolPrice]                   = useState(null); // live SOL/USD price
  // ── Sandbox ──
  const [sandboxMode, setSandboxMode]             = useState(false);
  const [sandboxState, setSandboxState]           = useState(null);
  const [sandboxPrices, setSandboxPrices]         = useState({});
  const [sandboxDashVisible, setSandboxDashVisible] = useState(false);
  const [userProfile, setUserProfile]             = useState(undefined); // undefined = not yet loaded
  const confirmStyle = userProfile?.confirmStyle ?? "panel";
  const [showRiskSheet, setShowRiskSheet]         = useState(false);
  const [autopilotConfig, setAutopilotConfig]     = useState(null);
  const [autopilotVisible, setAutopilotVisible]   = useState(false);
  const [tradeMode, setTradeMode]                    = useState("ask"); // "learn" | "ask" | "auto"
  const [chipsVisible, setChipsVisible]              = useState(true);
  const [voiceVisible, setVoiceVisible]              = useState(false);
  const [receiveVisible, setReceiveVisible]            = useState(false);
  const yieldTimerRef = useRef(null);
  const healthCardShownRef  = useRef(false);

  const flatListRef            = useRef(null);
  const abortRef               = useRef(null);
  const lastSentTextRef        = useRef("");   // restored to input on stop/undo
  const lastExecutedSigRef     = useRef(null); // set after a tx is broadcast
  const lastUserMsgIdRef       = useRef(null); // ID of user msg for current send cycle
  const saveTimerRef           = useRef(null); // debounce handle for auto-save
  const initialMessageSentRef  = useRef(false);

  // ── When sandbox is active everything visible uses virtual balances ──────────
  // Real chain balance is still fetched (needed if user exits sandbox) but
  // nothing shown to the user or sent to the agent should be the real number.
  const virtualSolBalance    = sandboxState?.balances?.SOL ?? 0;
  const displayBalance       = sandboxMode ? virtualSolBalance : solBalance;
  const sandboxUsd           = (sandboxState && Object.keys(sandboxPrices).length)
    ? calculatePnL(sandboxState, sandboxPrices).totalUsd
    : null;
  const displayPortfolioUsd  = sandboxMode ? sandboxUsd : portfolioUsd;

  useEffect(() => {
    if (!walletAddress) { setBalanceLoading(false); return; }
    let cancelled = false;

    // Reset stale values immediately so the header doesn't show wrong-network numbers
    setSolBalance(null);
    setPortfolioUsd(null);
    setSolPrice(null);

    // Load cache only for mainnet (devnet has no real USD value)
    if (network === "mainnet") {
      loadPortfolioCache(walletAddress, { ignoreExpiry: true }).then((cached) => {
        if (cached?.solPrice > 0 && !cancelled) {
          setPortfolioUsd(cached.totalUsd);
        }
      });
    }

    const SOL_MINT = "So11111111111111111111111111111111111111112";

    async function refreshBalance(isFirst = false) {
      if (sandboxMode) { if (isFirst) setBalanceLoading(false); return; } // no real RPC calls in sandbox
      if (isFirst) setBalanceLoading(true);
      try {
        const connection = new Connection(SOLANA_RPCS[network] ?? SOLANA_RPCS.mainnet, "confirmed");
        const lamports = await connection.getBalance(new PublicKey(walletAddress));
        if (cancelled) return;
        const sol = lamports / LAMPORTS_PER_SOL;
        setSolBalance(sol);

        // ── Fast USD: price SOL immediately from the RPC balance ────────────
        // Don't wait for the full portfolio fetch — show USD as soon as we
        // have a balance and a SOL price.
        if (network === "mainnet") {
          fetchPricesForMints([SOL_MINT]).then((prices) => {
            const solPrice = prices[SOL_MINT];
            if (solPrice > 0 && !cancelled) {
              setPortfolioUsd((prev) => prev == null ? sol * solPrice : prev);
            }
          }).catch(() => {});
        }

        // Only update the welcome message on the very first load
        if (isFirst) {
          setMessages((prev) => {
            // If a quick-action send already added a user message, don't nuke it —
            // just update the welcome message in-place.
            const hasUserMsg = prev.some((m) => m.role === "user");
            if (hasUserMsg) {
              return prev.map((m) => m.id === "welcome" ? buildWelcome(sol, walletAddress, walletStatus) : m);
            }
            return [buildWelcome(sol, walletAddress, walletStatus)];
          });
          fetchPortfolio(walletAddress, network)
            .then(async (p) => {
              if (cancelled) return;
              setPortfolio(p);
              // Full portfolio USD — replaces the quick SOL-only estimate.
              // Only accept if solPrice > 0 (price fetch succeeded).
              try {
                const usdResult = await calcPortfolioUsd(p);
                if (!cancelled && usdResult?.solPrice > 0) {
                  setPortfolioUsd(usdResult.totalUsd);
                  setSolPrice(usdResult.solPrice);
                  savePortfolioCache(walletAddress, {
                    portfolio: p,
                    totalUsd: usdResult.totalUsd,
                    solPrice: usdResult.solPrice,
                  });
                  // Portfolio breakdown card — shown once per session
                  if (!healthCardShownRef.current && usdResult.totalUsd > 1) {
                    healthCardShownRef.current = true;
                    try {
                      const SOL_MINT  = "So11111111111111111111111111111111111111112";
                      const MSOL_MINT = "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So";
                      const tokenMints = [SOL_MINT, ...(p.tokens || []).map((t) => t.mint)];
                      const prices = await fetchPricesForMints(tokenMints);

                      // Build table rows
                      const rows = [];
                      const solVal = sol * usdResult.solPrice;
                      rows.push(`| SOL | ${sol.toFixed(3)} | $${solVal.toFixed(0)} |`);

                      for (const tok of (p.tokens || [])) {
                        const price = prices[tok.mint] || 0;
                        const val   = tok.balance * price;
                        if (val < 0.50) continue; // skip dust
                        const bal = tok.balance >= 1_000_000
                          ? `${(tok.balance / 1_000_000).toFixed(2)}M`
                          : tok.balance >= 1_000
                          ? `${(tok.balance / 1_000).toFixed(1)}k`
                          : tok.balance.toFixed(2);
                        rows.push(`| ${tok.symbol} | ${bal} | $${val.toFixed(0)} |`);
                      }

                      for (const pos of (p.positions || [])) {
                        if (pos.type === "liquid_stake") {
                          const bal = pos.lstBalance ?? pos.msolBalance ?? 0;
                          if (bal <= 0) continue;
                          const sym = pos.symbol ?? "mSOL";
                          const posPrice = (pos.mint ? prices[pos.mint] : null) || prices[MSOL_MINT] || usdResult.solPrice;
                          const val = pos.usdValue > 0 ? pos.usdValue : bal * posPrice;
                          rows.push(`| ${sym} (staked) | ${bal.toFixed(3)} | $${val.toFixed(0)} |`);
                        }
                        if (pos.type === "lending") {
                          for (const dep of (pos.deposits || [])) {
                            if ((dep.usdValue || 0) < 0.50) continue;
                            rows.push(`| ${dep.symbol} (lending) | ${(dep.balance || 0).toFixed(2)} | $${(dep.usdValue || 0).toFixed(0)} |`);
                          }
                        }
                      }

                      const table = `| Asset | Balance | Value |\n|-------|---------|-------|\n${rows.join("\n")}`;

                      // ── Portfolio analysis ──────────────────────────────────
                      const stakedSol = (p.positions || [])
                        .filter((pos) => pos.type === "liquid_stake")
                        .reduce((sum, pos) => sum + (pos.solValue || pos.solEquivalent || pos.lstBalance || pos.msolBalance || 0), 0);
                      const lendingUsd = (p.positions || [])
                        .filter((pos) => pos.type === "lending")
                        .reduce((sum, pos) => sum + (pos.deposits || []).reduce((s, d) => s + (d.usdValue || 0), 0), 0);
                      const idleSol = Math.max(0, sol - stakedSol);
                      const idleUsd = idleSol * usdResult.solPrice;
                      const hasYield = stakedSol > 0.01 || lendingUsd > 1;

                      // Concentration risk: any single non-SOL token > 60% of portfolio
                      let concentrationNote = "";
                      for (const tok of (p.tokens || [])) {
                        const price = prices[tok.mint] || 0;
                        const val = tok.balance * price;
                        if (val / usdResult.totalUsd > 0.60 && usdResult.totalUsd > 20) {
                          concentrationNote = `\n\n**heads up:** ${tok.symbol} is ${((val / usdResult.totalUsd) * 100).toFixed(0)}% of your portfolio (~$${val.toFixed(0)}). that's a lot in one token — you might want to diversify a bit.`;
                          break;
                        }
                      }

                      let tail = "";
                      if (!hasYield && idleSol > 0.1) {
                        const yr = (idleUsd * 0.07).toFixed(0);
                        tail = `\n\n**none of this is earning yield right now.** ${idleSol.toFixed(2)} SOL (~$${idleUsd.toFixed(0)}) is sitting idle — at 7% APY on Marinade that's ~$${yr}/yr you're not getting. try *"move 20% of my SOL to yield"*.`;
                      } else if (hasYield && idleSol > 0.2) {
                        const yr = (idleUsd * 0.07).toFixed(0);
                        tail = `\n\n${idleSol.toFixed(2)} SOL (~$${idleUsd.toFixed(0)}) is still idle. want me to put it to work?`;
                      }

                      setMessages((prev) => [
                        ...prev,
                        {
                          id: `health_${Date.now()}`,
                          role: "homie",
                          text: `alright, here's your wallet:\n\n${table}\n\n**Total: ~$${usdResult.totalUsd.toFixed(0)}**${tail}${concentrationNote}`,
                          strategies: [],
                        },
                      ]);
                    } catch {}
                  }
                }
              } catch {}
            })
            .catch(() => {});
        }
      } catch {
        if (isFirst && !cancelled) {
          setMessages((prev) => {
            const hasUserMsg = prev.some((m) => m.role === "user");
            if (hasUserMsg) {
              return prev.map((m) => m.id === "welcome" ? buildWelcome(0, walletAddress, walletStatus) : m);
            }
            return [buildWelcome(0, walletAddress, walletStatus)];
          });
        }
      } finally {
        if (isFirst && !cancelled) setBalanceLoading(false);
      }
    }

    refreshBalance(true);
    // Poll every 15 s — silently updates the header balance without touching messages
    const interval = setInterval(() => refreshBalance(false), 15_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [walletAddress, network]);

  // ─── Conversation memory: restore LLM history from last session ──────────────
  useEffect(() => {
    if (!walletAddress) return;
    loadLatestHistory(walletAddress).then((recent) => {
      if (!recent) return;
      // Inject saved history so the LLM remembers prior context
      setConversationHistory(recent.conversationHistory);
      // Friendly "you're back" note if session is less than 7 days old
      const age = Date.now() - new Date(recent.meta.updatedAt).getTime();
      if (age < 7 * 24 * 60 * 60 * 1000 && recent.meta.title) {
        const topic = recent.meta.title.length > 50
          ? recent.meta.title.slice(0, 50) + "…"
          : recent.meta.title;
        setMessages((prev) => [
          ...prev,
          {
            id: `memory_${Date.now()}`,
            role: "homie",
            text: `hey, welcome back. last time we were talking about "${topic}" — pick up where we left off or ask me something new.`,
            strategies: [],
          },
        ]);
      }
    }).catch(() => {});
  }, [walletAddress]);

  // ─── Show onboarding on first wallet connect ─────────────────────────────────
  useEffect(() => {
    if (!walletAddress) return;
    shouldShowOnboarding().then((show) => {
      if (show) setOnboardingVisible(true);
    }).catch(() => {});
  }, [walletAddress]);

  // ─── Load risk profile; show setup sheet if first time ───────────────────────
  useEffect(() => {
    if (!walletAddress) return;
    loadProfile(walletAddress).then((profile) => {
      setUserProfile(profile);
      if (!profile) setShowRiskSheet(true);
    }).catch(() => {
      setUserProfile(null);
    });
  }, [walletAddress]);

  // ─── Load autopilot config ────────────────────────────────────────────────────
  useEffect(() => {
    if (!walletAddress) return;
    loadAutopilot(walletAddress).then(setAutopilotConfig).catch(() => {});
  }, [walletAddress]);

  // ─── Load saved trade mode ───────────────────────────────────────────────────
  useEffect(() => {
    getSavedTradeMode().then(setTradeMode).catch(() => {});
  }, []);

  // ─── Load confirm threshold ───────────────────────────────────────────────────
  useEffect(() => {
    loadConfirmThreshold().then(setConfirmThresholdUsd).catch(() => {});
  }, []);

  // ─── Auto-send message from HomeScreen quick actions ─────────────────────────
  useEffect(() => {
    const msg = route?.params?.initialMessage;
    if (!msg || initialMessageSentRef.current) return;
    initialMessageSentRef.current = true;
    // Small delay to let the screen settle before firing the send
    const t = setTimeout(() => send(msg), 600);
    return () => clearTimeout(t);
  }, [route?.params?.initialMessage]);

  // ─── Auto-save conversation ───────────────────────────────────────────────────
  useEffect(() => {
    const hasUser = messages.some((m) => m.role === "user");
    if (!hasUser || !walletAddress) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      await saveConversation(walletAddress, { id: currentConvId, messages, conversationHistory });
      // Fire-and-forget: embed this conversation for future semantic search
      const firstUser = messages.find(m => m.role === "user");
      const lastHomie = [...messages].reverse().find(m => m.role === "homie");
      if (firstUser && lastHomie) {
        saveConversationEmbedding(walletAddress, currentConvId, {
          title: firstUser.text.slice(0, 80),
          preview: lastHomie.text.slice(0, 120),
        });
      }
    }, 1500);
    return () => clearTimeout(saveTimerRef.current);
  }, [messages, conversationHistory]);

  // ─── Sandbox: load state when wallet ready ────────────────────────────────────
  useEffect(() => {
    if (!walletAddress) return;
    loadSandboxState(walletAddress).then((saved) => {
      setSandboxState(saved || createFreshState());
    });
  }, [walletAddress]);

  // ─── Push notifications: register token once wallet is connected ──────────────
  useEffect(() => {
    if (!walletAddress) return;
    registerForPushNotifications()
      .then((token) => {
        if (token) registerPushToken(walletAddress, token).catch(() => {});
      })
      .catch(() => {});

    // Listen for notification taps — deep link to relevant action
    const unsub = addNotificationListeners(
      null, // onReceive — no-op for now
      (response) => {
        const data = response.notification.request.content.data;
        if (data?.type === "position_alert") {
          // Could navigate to a position detail screen in future
          console.log("[Notification] Tapped position alert:", data);
        }
      }
    );
    return unsub;
  }, [walletAddress]);

  // ─── Sandbox: persist on every change ────────────────────────────────────────
  useEffect(() => {
    if (!walletAddress || !sandboxState) return;
    saveSandboxState(walletAddress, sandboxState);
  }, [sandboxState]);

  // ─── Sandbox: yield accrual timer (every 30 s while sandbox is open) ─────────
  useEffect(() => {
    if (!sandboxMode || !sandboxState) {
      clearInterval(yieldTimerRef.current);
      return;
    }
    function tick() {
      setSandboxState((prev) => {
        if (!prev) return prev;
        const { newState } = updateYield(prev);
        return newState;
      });
    }
    yieldTimerRef.current = setInterval(tick, 30_000);
    tick(); // immediate first tick on entering sandbox
    return () => clearInterval(yieldTimerRef.current);
  }, [sandboxMode]);

  // ─── Sandbox: refresh prices every 30 s while active ─────────────────────────
  useEffect(() => {
    if (!sandboxMode || !sandboxState) return;
    const refresh = () => {
      const syms = Object.keys(sandboxState.balances || {});
      if (!syms.length) return;
      fetchTokenPricesUsd(syms).then((prices) => {
        setSandboxPrices(prices);
        // Set PnL baseline on first price snapshot — so PnL starts at $0 not +$0
        setSandboxState((prev) => {
          if (!prev || prev.initialValueUsd) return prev;
          const { totalUsd } = calculatePnL(prev, prices);
          if (!(totalUsd > 0)) return prev;
          return { ...prev, initialValueUsd: totalUsd };
        });
      });
    };
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [sandboxMode, sandboxState?.balances]);

  // ─── Sandbox helpers ──────────────────────────────────────────────────────────
  function toggleSandbox() {
    setSandboxMode((prev) => {
      const next = !prev;

      // Always start a clean conversation when switching modes so live and
      // sandbox messages never mix in the same thread.
      abortRef.current?.abort();
      abortRef.current = null;
      setLoading(false);
      setPendingTx(null);
      setCurrentConvId(newConversationId());
      setConversationHistory([]);
      setInput("");

      const welcomeText = next
        ? "[Sandbox] ON — you have $200 virtual USDC + 1 SOL for gas. All trades use real Jupiter prices but nothing touches your actual wallet. Try: \"swap 100 USDC to SOL\" or \"buy some BONK\"."
        : "Back to Live mode. Your real wallet and funds are active again.";

      setMessages([
        buildWelcome(solBalance, walletAddress, walletStatus),
        {
          id: (Date.now() + 1).toString(),
          role: "homie",
          text: welcomeText,
          strategies: [],
        },
      ]);

      return next;
    });
  }

  async function handleSandboxReset() {
    if (!walletAddress) return;
    const fresh = await resetSandboxState(walletAddress);
    setSandboxState(fresh);
    setSandboxPrices({});
    setMessages((msgs) => [
      ...msgs,
      {
        id: Date.now().toString(),
        role: "homie",
        text: "[Sandbox] Reset. Starting fresh with $200 virtual USDC + 1 SOL.",
        strategies: [],
      },
    ]);
  }

  // ─── Record a performance snapshot after each sandbox action ─────────────────
  function recordSnapshot(newSbState, prices) {
    const { totalUsd } = calculatePnL(newSbState, prices);
    const snap = { timestamp: Date.now(), valueUsd: totalUsd };
    const snaps = [...(newSbState.performanceSnapshots || []), snap].slice(-200);
    return { ...newSbState, performanceSnapshots: snaps };
  }

  // ─── Simulate a transaction (sandbox path for confirmTransaction) ─────────────
  async function simulateSandboxTx(tx) {
    const parsed = parseTxAction(tx);
    if (!parsed) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "homie",
          text: `[Sandbox] Action type not yet simulated: "${tx.action}". No balances changed.`,
          strategies: [],
        },
      ]);
      return;
    }

    // Capture current sol price for leverage calculations
    const currentSolPrice = sandboxPrices?.SOL ?? null;

    let result;
    try {
      if (parsed.type === "stake") {
        result = await simulateStake(sandboxState, parsed.amount);
      } else if (parsed.type === "unstake") {
        result = await simulateUnstake(sandboxState, parsed.amount);
      } else if (parsed.type === "swap") {
        result = await simulateSwap(sandboxState, parsed.from, parsed.to, parsed.amount);
      } else if (parsed.type === "lend") {
        result = simulateLend(sandboxState, parsed.token, parsed.amount);
      } else if (parsed.type === "withdraw") {
        result = simulateWithdrawLend(sandboxState, parsed.token, parsed.amount);
      } else if (parsed.type === "leverage") {
        result = simulateLeverage(sandboxState, parsed.token, parsed.depositAmount, parsed.leverage, currentSolPrice);
      } else if (parsed.type === "lp_open") {
        const amountA = tx.inputAmount ?? parsed.amountA ?? 0;
        result = simulateLpOpen(sandboxState, parsed.tokenA, amountA, parsed.tokenB, 0, tx.protocol);
      } else {
        result = { error: `Action not yet simulated in sandbox: ${parsed.type}` };
      }
    } catch (err) {
      result = { error: err.message };
    }

    if (result.error) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "homie",
          text: `[Sandbox] ${result.error}`,
          strategies: [],
        },
      ]);
      return;
    }

    // Fetch fresh prices for snapshot
    const allSymbols = [
      ...Object.keys(result.newState.balances),
      ...Object.keys(result.newState.lendingPositions || {}),
    ];
    const prices = await fetchTokenPricesUsd(allSymbols);
    setSandboxPrices(prices);

    // Seed initial value on first action
    let finalState = result.newState;
    if (!finalState.initialValueUsd) {
      const { totalUsd } = calculatePnL(finalState, prices);
      finalState = { ...finalState, initialValueUsd: totalUsd };
    }

    // Record performance snapshot
    finalState = recordSnapshot(finalState, prices);
    setSandboxState(finalState);

    const r = result.result;
    const { totalUsd, pnlAbsolute, pnlPercent } = calculatePnL(finalState, prices);
    const pnlSign = pnlAbsolute >= 0 ? "+" : "";

    let actionLine = "";
    if (r.type === "sandbox_swap") {
      actionLine = `Swapped ${r.fromAmount.toFixed(4)} ${r.from} → ${r.toAmount.toFixed(4)} ${r.to}`;
    } else if (r.type === "sandbox_lend") {
      actionLine = `Deposited ${r.amount} ${r.token} into Kamino at ${r.apy}% APY`;
    } else if (r.type === "sandbox_withdraw") {
      const interestStr = r.interest > 0.000001 ? ` + $${(r.interest).toFixed(4)} interest` : "";
      actionLine = `Withdrew ${r.amount.toFixed(4)} ${r.token} from Kamino${interestStr}`;
    } else if (r.type === "sandbox_leverage") {
      actionLine = `Opened ${r.leverage}x leverage on ${r.depositAmount} ${r.token}${r.liquidationPrice ? ` — liquidation at $${r.liquidationPrice}` : ""}`;
    } else if (r.type === "sandbox_lp_open") {
      actionLine = `Opened ${r.tokenA}-${r.tokenB} LP on ${r.protocol || "Orca"}`;
    }

    const confirmText =
      `[Sandbox] Done.\n${actionLine}\n\n` +
      `Virtual portfolio: $${totalUsd.toFixed(2)}  ` +
      `(${pnlSign}$${Math.abs(pnlAbsolute).toFixed(2)} / ${pnlSign}${Math.abs(pnlPercent).toFixed(2)}%)`;

    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), role: "homie", text: confirmText, strategies: [] },
    ]);

    // Feed the simulation result back into conversation history so agent knows what happened
    setConversationHistory((prev) => [
      ...prev,
      { role: "user", content: `[Sandbox confirmed] ${actionLine}. Virtual portfolio now: $${totalUsd.toFixed(2)}.` },
    ].slice(-20));
  }

  // ─── New chat / load chat ─────────────────────────────────────────────────────
  function newChat() {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setPendingTx(null);
    setCurrentConvId(newConversationId());
    setConversationHistory([]);
    setInput("");
    setMessages([buildWelcome(solBalance, walletAddress, walletStatus)]);
  }

  async function handleLoadConversation(id) {
    const data = await loadConversation(id);
    if (!data) return;
    setCurrentConvId(id);
    setMessages(data.messages || []);
    setConversationHistory(data.conversationHistory || []);
    setInput("");
    setPendingTx(null);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
  }

  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    // Remove the current cycle's user message + any partial response
    if (lastUserMsgIdRef.current) {
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === lastUserMsgIdRef.current);
        return idx === -1 ? prev : prev.slice(0, idx);
      });
    }
    // Restore the last sent message so the user can edit and resend
    setInput(lastSentTextRef.current);
  }

  function handleUndo(messageText, messageId) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    // Abort any in-flight request
    if (loading) {
      abortRef.current?.abort();
      abortRef.current = null;
      setLoading(false);
    }
    setPendingTx(null);
    // Slice messages: remove the target message and everything after it
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === messageId);
      if (idx === -1) return prev;
      const sliced = prev.slice(0, idx);
      // If a tx was already broadcast inform the user (appended after slice)
      if (lastExecutedSigRef.current) {
        return [
          ...sliced,
          {
            id: Date.now().toString(),
            role: "homie",
            text: "That transaction was already sent to the blockchain and cannot be reversed on-chain.",
            strategies: [],
          },
        ];
      }
      return sliced;
    });
    // Restore the message text to the input box
    setInput(messageText);
  }

  function friendlyApiError(err) {
    const msg = (err?.message || "").toLowerCase();
    if (msg.includes("network") || msg.includes("fetch") || msg.includes("connect") || msg.includes("failed to fetch"))
      return "can't reach the server right now — check your connection and try again.";
    if (msg.includes("timeout") || msg.includes("abort"))
      return "took too long to respond — network might be slow, try again.";
    if (msg.includes("500") || msg.includes("502") || msg.includes("503"))
      return "something broke on my end, not yours. give it a sec and try again.";
    if (msg.includes("429") || msg.includes("rate limit"))
      return "I'm getting too many requests at once — wait a moment and send that again.";
    if (msg.includes("jupiter"))
      return "Jupiter swap failed — their API may be busy. try again in a moment.";
    if (msg.includes("stream ended without"))
      return "response didn't complete — network hiccup, try again.";
    // Pass through server-provided messages that are already user-friendly
    if (err?.message && err.message.length < 120) return err.message;
    return "something went sideways just now. try sending that again.";
  }

  function friendlyTxError(err) {
    const msg = (err?.message || "").toLowerCase();
    if (msg.includes("user rejected") || msg.includes("cancelled") || msg.includes("denied"))
      return "looks like you cancelled that one — nothing was sent, no funds moved.";
    if (msg.includes("insufficient") || msg.includes("not enough"))
      return "you don't have enough SOL to cover this transaction + the network fee. top up a little and try again.";
    if (msg.includes("blockhash") || msg.includes("expired"))
      return "the transaction expired before it went through — the blockchain was slow, nothing moved. try again.";
    if (msg.includes("timeout"))
      return "transaction timed out waiting for a signature — nothing went through, you're good.";
    if (msg.includes("wallet not ready") || msg.includes("wallet"))
      return "wallet isn't ready yet — give it a second and try again.";
    return `that transaction didn't go through. ${err?.message ? `(${err.message.slice(0, 80)})` : ""} nothing was sent.`;
  }

  async function send(textOverride) {
    const text = (typeof textOverride === "string" ? textOverride : input).trim();
    if (!text || loading) return;

    // Haptic feedback on send
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    // Local intercepts — handled by AI inline cards

    lastSentTextRef.current = text;
    lastExecutedSigRef.current = null;
    setInput("");
    setLoading(true);

    // Record for autocomplete learning (fire-and-forget)
    recordUserQuery(walletAddress, text);

    const controller = new AbortController();
    abortRef.current = controller;

    const userMsg = { id: Date.now().toString(), role: "user", text };
    lastUserMsgIdRef.current = userMsg.id;
    setMessages((prev) => [...prev, userMsg]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);

    // Build history — prepend semantic memory context if available
    const memoryContext = await buildMemoryContext(walletAddress, text).catch(() => null);
    const newHistory = [
      ...(memoryContext ? [{ role: "system", content: memoryContext }] : []),
      ...conversationHistory,
      { role: "user", content: text },
    ];

    try {
      // Refresh token immediately before request — Privy may not have resolved on first authenticated event
      const freshToken = await getAccessToken().catch(() => null);
      if (freshToken) setAuthToken(freshToken);

      const data = await askHomieStream(
        text,
        { walletAddress, solBalance: displayBalance, network, userProfile, autopilotConfig, sandboxMode, sandboxVirtualBalances: sandboxMode ? sandboxState?.balances : null, tradeMode },
        newHistory,
        (status) => setAgentStatus(status),
        controller.signal,
      );

      // Update conversation history
      setConversationHistory([
        ...newHistory,
        { role: "assistant", content: JSON.stringify(data) },
      ].slice(-20)); // keep last 20

      // app-level actions (riskSnapshot handled inline in message)

      const homieMsg = {
        id: (Date.now() + 1).toString(),
        role: "homie",
        text: data.message,
        strategies: data.strategies || [],
        choices: data.choices || [],
        transaction: data.transaction || null,
        tip: data.tip,
        portfolio: data.portfolio || null,
        tokenChart: data.tokenChart || null,
        sentiment: data.sentiment || null,
        crossVenueStrategy: data.crossVenueStrategy || null,
        riskSnapshot: data.riskSnapshot || null,
        projection: data.projection || null,
        multiply: data.multiply || null,
        playbookProposal: data.playbookProposal || null,
        awaitingConfirmation: data.awaitingConfirmation === true,
        // Auto-attach wallet QR when agent talks about receiving/funding and balance is low
        showWalletQR: (() => {
          if (displayBalance > 0.01) return false;
          const t = (data.message || "").toLowerCase();
          return /fund|deposit|receive|add sol|send sol|top.?up|transfer.*to your|wallet address/.test(t);
        })(),
      };
      setMessages((prev) => [...prev, homieMsg]);

      if (data.transaction?.serializedTx) {
        const tx         = data.transaction;
        const amountUsd  = (tx.inputAmount || 0) * (solPrice || 0);
        const highRisk   = isHighRiskTx(tx);
        const autoExec   = !highRisk && (
          (confirmStyle === "slider") ||
          (confirmThresholdUsd != null && amountUsd <= confirmThresholdUsd)
        );

        if (autoExec) {
          setMessages((prev) => [...prev, {
            id: (Date.now() + 2).toString(),
            role: "homie",
            text: `Executing: ${tx.action}…`,
            strategies: [],
          }]);
          confirmTransaction(tx);
        } else {
          setPendingTx(tx);
        }
      }
    } catch (err) {
      if (err?.name === "AbortError") return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      const msg = friendlyApiError(err);
      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: "homie", text: msg, strategies: [], isError: true, retryText: lastSentTextRef.current },
      ]);
    } finally {
      abortRef.current = null;
      setLoading(false);
      setAgentStatus("");
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }

  async function confirmTransaction(tx) {
    // ── Sandbox path: simulate instead of broadcasting ──
    if (sandboxMode) {
      setPendingTx(null);
      await simulateSandboxTx(tx);
      return;
    }

    const rpcUrl = SOLANA_RPCS[network] ?? SOLANA_RPCS.mainnet;

    try {
      const txBuffer = Buffer.from(tx.serializedTx, "base64");
      const transaction = VersionedTransaction.deserialize(txBuffer);
      const connection = new Connection(rpcUrl, "confirmed");

      let signature;

      const importedKeyB64 = await SecureStore.getItemAsync(IMPORTED_KEY_STORE);
      if (importedKeyB64) {
        const keypair = Keypair.fromSecretKey(Buffer.from(importedKeyB64, "base64"));
        transaction.sign([keypair]);
        signature = await connection.sendRawTransaction(transaction.serialize());
      } else {
        const wallet = solanaWalletState?.wallets?.[0];
        if (!wallet) throw new Error("Wallet not ready");
        signature = await wallet.sendTransaction(transaction, connection);
      }

      lastExecutedSigRef.current = signature;

      // Parse output amount from estimatedOutput string (e.g. "~7.2 mSOL" → 7.2)
      const outputAmountRaw = tx.estimatedOutput
        ? parseFloat(tx.estimatedOutput.replace(/[^0-9.]/g, "")) || null
        : null;

      const tradeRecord = {
        signature,
        protocol:       tx.protocol ?? "Unknown",
        action:         tx.action ?? "Transaction",
        estimatedOutput: tx.estimatedOutput ?? null,
        fee:            tx.fee ?? null,
        executedAt:     new Date().toISOString(),
        // Structured fields for PnL tracking
        inputToken:    tx.inputToken ?? null,
        inputAmount:   tx.inputAmount ?? null,
        inputPriceUsd: solPrice ?? null,
        outputToken:   tx.outputToken ?? null,
        outputAmount:  outputAmountRaw,
      };

      saveTrade(walletAddress, tradeRecord);
      // Check trade count for milestone messages (fire-and-forget)
      listTrades(walletAddress).then((trades) => {
        const count = trades.length;
        const MILESTONES = [1, 5, 10, 25, 50];
        if (MILESTONES.includes(count)) {
          const msgs = {
            1:  "first trade done. that's how it starts.",
            5:  "5 trades on Homie. you're getting the hang of this.",
            10: "10 trades in. you're a regular now.",
            25: "25 trades. ngl you're more active than most people in crypto.",
            50: "50 trades with Homie. legend.",
          };
          setTimeout(() => {
            setMessages((prev) => [
              ...prev,
              { id: `milestone_${Date.now()}`, role: "homie", text: msgs[count], strategies: [] },
            ]);
          }, 3000);
        }
      }).catch(() => {});

      if (tx.protocol && tx.action && walletAddress) {
        const actionLower = tx.action.toLowerCase();
        const posAction   = actionLower.includes("leverage") || actionLower.includes("multiply") ? "leverage"
                          : actionLower.includes("stake")    ? "stake"
                          : actionLower.includes("lend")     ? "lend"
                          : actionLower.includes("lp")       ? "lp"
                          : "lend";

        const leverageData = posAction === "leverage" && tx.details
          ? {
              collToken:       tx.details.collToken ?? tx.inputToken ?? "SOL",
              debtToken:       tx.details.debtToken ?? tx.outputToken ?? "USDC",
              targetLeverage:  tx.details.targetLeverage ?? 2,
            }
          : null;

        registerPosition(walletAddress, {
          protocol:       tx.protocol,
          pair:           tx.estimatedOutput ?? tx.action,
          action:         posAction,
          amountUsd:      tx.inputAmount && solPrice ? tx.inputAmount * solPrice : 0,
          entrySolPrice:  solPrice ?? 0,
          entryRiskScore: 0,
          leverageData,
        }).catch(() => {});
      }

      setPendingTx(null);

      // Add pending message — will be updated by polling
      const sentMsgId = `tx_${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: sentMsgId,
          role: "homie",
          text: `⏳ Transaction sent.\n\`${signature.slice(0, 12)}...\`\nWaiting for confirmation...`,
          solscanUrl: `https://solscan.io/tx/${signature}`,
          strategies: [],
        },
      ]);

      // ── Poll for on-chain confirmation ────────────────────────────────────
      const pollStart = Date.now();
      const poll = setInterval(async () => {
        try {
          if (Date.now() - pollStart > 60_000) {
            clearInterval(poll);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === sentMsgId
                  ? { ...m, text: `Confirmation timed out. [${signature.slice(0, 12)}... → Solscan](https://solscan.io/tx/${signature})` }
                  : m
              )
            );
            return;
          }

          const { value: status } = await connection.getSignatureStatus(signature, {
            searchTransactionHistory: true,
          });

          if (status?.err) {
            clearInterval(poll);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === sentMsgId
                  ? { ...m, text: `transaction failed on-chain — nothing moved. [${signature.slice(0, 12)}... → Solscan](https://solscan.io/tx/${signature})` }
                  : m
              )
            );
            return;
          }

          if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
            clearInterval(poll);
            const insight = tradeInsightText(tradeRecord);
            const confirmedText = `✓ Confirmed. [${signature.slice(0, 12)}... → Solscan](https://solscan.io/tx/${signature})${insight ? `\n\n${insight}` : ""}`;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === sentMsgId
                  ? { ...m, text: confirmedText }
                  : m
              )
            );

            // Refresh SOL balance silently
            new Connection(rpcUrl, "confirmed")
              .getBalance(new PublicKey(walletAddress))
              .then((lamps) => setSolBalance(lamps / LAMPORTS_PER_SOL))
              .catch(() => {});

            // Post-execution narration (non-blocking)
            const postTxMeta = JSON.stringify({
              type:           tx.type ?? "transaction",
              protocol:       tx.protocol ?? "",
              action:         tx.action ?? "",
              inputToken:     tx.inputToken ?? "",
              inputAmount:    tx.inputAmount ?? null,
              outputToken:    tx.outputToken ?? "",
              estimatedOutput: tx.estimatedOutput ?? "",
            });
            askHomie(
              `__post_tx__:${postTxMeta}`,
              { walletAddress, solBalance: displayBalance, network, userProfile, autopilotConfig, sandboxMode, sandboxVirtualBalances: sandboxMode ? sandboxState?.balances : null, tradeMode },
              [],
              null
            )
              .then((followUp) => {
                if (!followUp?.message) return;
                setMessages((prev) => [
                  ...prev,
                  {
                    id: `posttx_${Date.now()}`,
                    role: "homie",
                    text: followUp.message,
                    strategies: followUp.strategies || [],
                    projection:  followUp.projection || null,
                  },
                ]);
              })
              .catch(() => {});
          }
        } catch (err) {
          console.error("[Poll] Confirmation polling error:", err.message);
          clearInterval(poll);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === sentMsgId
                ? { ...m, text: `Couldn't check confirmation status. [Check on Solscan →](https://solscan.io/tx/${signature})` }
                : m
            )
          );
        }
      }, 2000);
    } catch (err) {
      setPendingTx(null);
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), role: "homie", text: friendlyTxError(err), strategies: [] },
      ]);
    }
  }

  function shortAddr(addr) {
    if (!addr) return "—";
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
  }

  const handleCopyMessage = useCallback(async (text) => {
    await Clipboard.setStringAsync(text);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    // Brief visual feedback via a toast-like state isn't needed — the haptic is enough
  }, []);

  function renderMessage({ item }) {
    if (item.role === "user") {
      return (
        <View style={styles.userRow}>
          <Pressable
            style={styles.userBubble}
            onLongPress={() => handleCopyMessage(item.text)}
            delayLongPress={400}
          >
            <Text style={styles.userText}>{item.text}</Text>
          </Pressable>
          <TouchableOpacity
            style={styles.undoBtn}
            onPress={() => handleUndo(item.text, item.id)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.undoBtnIcon}>↩</Text>
          </TouchableOpacity>
        </View>
      );
    }
    const tone = detectTone(item.text);
    return (
      <View style={styles.homieRow}>
        <HomieAvatar />
        <View style={styles.homieContent}>
          <Pressable onLongPress={() => handleCopyMessage(item.text)} delayLongPress={400}>
          <GlowBubble style={styles.homieBubble}>
            <ToneAccent tone={tone} />
            <Markdown style={markdownStyles} rules={tableRules}>{item.text}</Markdown>
            {item.choices?.length > 0 && (
              <View style={styles.choicesRow}>
                {item.choices.map((choice, ci) => (
                  <TouchableOpacity
                    key={ci}
                    style={styles.choiceChip}
                    onPress={() => send(choice)}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.choiceChipText}>{choice}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {item.solscanUrl && (
              <TouchableOpacity
                style={styles.solscanBtn}
                onPress={() => Linking.openURL(item.solscanUrl)}
                activeOpacity={0.75}
              >
                <Text style={styles.solscanText}>View on Solscan ↗</Text>
              </TouchableOpacity>
            )}
            {/* ── Retry button for error messages ── */}
            {item.isError && item.retryText && (
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  send(item.retryText);
                }}
                activeOpacity={0.75}
              >
                <Text style={styles.retryBtnText}>↻ Tap to retry</Text>
              </TouchableOpacity>
            )}
          </GlowBubble>
          </Pressable>
          {item.showWalletQR && walletAddress && (
            <InlineWalletQR walletAddress={walletAddress} />
          )}
          {item.portfolio && (
            <>
              <PortfolioCard portfolio={item.portfolio} />
              <PnLCard walletAddress={walletAddress} />
            </>
          )}
          {item.tokenChart && <TokenStatsCard data={item.tokenChart} />}
          {item.sentiment && <SentimentCard data={item.sentiment} />}
          {item.crossVenueStrategy && <CrossVenueCard data={item.crossVenueStrategy} />}
          {item.riskSnapshot && (
            <RiskSnapshotCard
              snapshot={item.riskSnapshot}
              portfolio={portfolio ? { ...portfolio, solPrice: solPrice ?? 0 } : null}
              solBalance={displayBalance}
              onHedge={(from, to, amtUsd) => send(`hedge ${from} to ${to}, about $${amtUsd.toFixed(0)} worth`)}
            />
          )}
          {item.projection && <ProjectionCard data={item.projection} />}
          {item.multiply && (
            <MultiplyCard
              data={item.multiply}
              onExecute={(lev, coll) => send(`Open Kamino Multiply at ${lev.toFixed(1)}x leverage on ${item.multiply.collateralAmount ?? ""} ${coll ?? item.multiply.collateral ?? "SOL"}`)}
            />
          )}
          {item.playbookProposal && (
            <PlaybookCard
              data={item.playbookProposal}
              walletAddress={walletAddress}
              onSignTx={item.playbookProposal.serializedTx
                ? (serializedTx) => confirmTransaction({ serializedTx, action: item.playbookProposal.name, protocol: "Jupiter DCA" })
                : null
              }
              onConfirmed={() => send("playbook authorized — what else should I set up?")}
              onDeclined={() => {}}
            />
          )}
          {item.strategies?.length > 0 && (
            <StrategyCardStack
              strategies={item.strategies}
              walletAddress={walletAddress}
              onTransactionReady={(tx) => setPendingTx(tx)}
              onExecuteStrategy={(msg) => send(msg)}
            />
          )}
          {item.awaitingConfirmation && !item.confirmationDone && (
            confirmStyle === "slider" ? (
              <SlideToConfirm
                label="slide to confirm"
                onConfirm={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                  setMessages((prev) =>
                    prev.map((m) => m.id === item.id ? { ...m, confirmationDone: true } : m)
                  );
                  send("go ahead");
                }}
              />
            ) : (
              <TouchableOpacity
                style={styles.reviewBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setMessages((prev) =>
                    prev.map((m) => m.id === item.id ? { ...m, confirmationDone: true } : m)
                  );
                  send("go ahead");
                }}
                activeOpacity={0.78}
              >
                <Text style={styles.reviewBtnText}>Review & Sign</Text>
                <Text style={styles.reviewBtnArrow}>→</Text>
              </TouchableOpacity>
            )
          )}
          {item.tip && (
            <View style={styles.tipBox}>
              <View style={styles.tipIconBox}><Text style={styles.tipIconText}>i</Text></View>
              <Text style={styles.tipText}>{item.tip}</Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: BLACK }}>
      {/* Skia atmospheric glow background */}
      <SkiaGlowBackground />

      {/* Header outside SafeAreaView — extends behind status bar */}
      <SkiaHeaderCard
        walletAddress={walletAddress}
        solBalance={displayBalance}
        portfolioUsd={displayPortfolioUsd}
        balanceLoading={balanceLoading && !sandboxMode}
        onLogout={logout}
        onHistory={() => setHistoryVisible(true)}
        onBack={navigation?.canGoBack() ? () => navigation.goBack() : undefined}
        onAutopilot={() => setAutopilotVisible(true)}
        autopilotActive={!!autopilotConfig?.enabled}
        network={network}
        onNetworkToggle={() => setNetwork(n => n === "mainnet" ? "devnet" : "mainnet")}
        sandboxMode={sandboxMode}
        onSandboxToggle={toggleSandbox}
      />

      <SafeAreaView style={styles.safe} edges={["bottom", "left", "right"]}>

        {/* ── Sandbox Banner — shown when sandbox is active ── */}
        {sandboxMode && sandboxState && (() => {
          const { totalUsd, pnlAbsolute, pnlPercent } = calculatePnL(sandboxState, sandboxPrices);
          return (
            <SandboxBanner
              totalUsd={totalUsd}
              pnlAbsolute={pnlAbsolute}
              pnlPercent={pnlPercent}
              onOpen={() => setSandboxDashVisible(true)}
            />
          );
        })()}

        {/* ── Chat Container — glass panel ── */}
        <View style={styles.chatContainer}>
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.messageList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            ListFooterComponent={loading ? <TypingIndicator status={agentStatus} /> : null}
          />
        </View>

        {/* ── Suggestion chips — collapsible ── */}
        {!loading && !sandboxMode && (() => {
          const isInitial = messages.length === 1;
          const chips = isInitial ? getQuickSuggestions(solBalance) : getContextualChips(messages);
          if (!chips) return null;
          return (
            <View style={styles.suggestionsContainer}>
              {/* Toggle + Positions row */}
              <View style={styles.chipsControlRow}>
                <TouchableOpacity
                  style={styles.chipsToggle}
                  onPress={() => setChipsVisible(v => !v)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  {chipsVisible
                    ? <ChevronDown size={14} color="rgba(255,255,255,0.40)" strokeWidth={2.5} />
                    : <ChevronUp   size={14} color="rgba(255,255,255,0.40)" strokeWidth={2.5} />
                  }
                  <Text style={styles.chipsToggleText}>
                    {chipsVisible ? "Hide" : "Suggestions"}
                  </Text>
                </TouchableOpacity>

                {/* Positions button — premium compact */}
                {!sandboxMode && walletAddress && (
                  <TouchableOpacity
                    style={styles.positionsBtn}
                    onPress={() => setPositionsVisible(true)}
                    activeOpacity={0.75}
                  >
                    <Layers size={13} color={GREEN} strokeWidth={2.5} />
                    <Text style={styles.positionsBtnText}>Positions</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Chips */}
              {chipsVisible && (
                <View style={styles.suggestionsRow}>
                  {chips.map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={styles.suggestionChip}
                      onPress={() => send(s)}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.suggestionText}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          );
        })()}

        {/* Positions button fallback — shown alone when no suggestion chips exist */}
        {!loading && !sandboxMode && walletAddress && (() => {
          const isInitial = messages.length === 1;
          const chips = isInitial ? getQuickSuggestions(solBalance) : getContextualChips(messages);
          if (chips) return null; // chips section already renders the button
          return (
            <View style={styles.positionsFallbackRow}>
              <TouchableOpacity
                style={styles.positionsBtn}
                onPress={() => setPositionsVisible(true)}
                activeOpacity={0.75}
              >
                <Layers size={13} color={GREEN} strokeWidth={2.5} />
                <Text style={styles.positionsBtnText}>Positions</Text>
              </TouchableOpacity>
            </View>
          );
        })()}

        {/* ── Autocomplete suggestion chip ── */}
        {suggestion && !loading && (
          <TouchableOpacity
            style={styles.suggestionGhost}
            onPress={() => setInput(suggestion)}
            activeOpacity={0.75}
          >
            <Text style={styles.suggestionGhostText} numberOfLines={1}>{suggestion}</Text>
            <Text style={styles.suggestionGhostTab}>tab</Text>
          </TouchableOpacity>
        )}

        {/* ── Input Area — glass bar ── */}
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.inputArea}>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Message Homie..."
                placeholderTextColor={TEXT_MUTED}
                value={input}
                onChangeText={setInput}
                onSubmitEditing={send}
                multiline
                returnKeyType="send"
              />
              
              <View style={styles.actionControls}>
                {/* Mic button — opens voice input */}
                {!loading && (
                  <TouchableOpacity
                    style={styles.micBtn}
                    onPress={() => setVoiceVisible(true)}
                    activeOpacity={0.75}
                  >
                    <Mic size={18} color="#4ADE80" strokeWidth={2} />
                  </TouchableOpacity>
                )}
                {/* Spacer pushes stop/send to the right */}
                <View style={{ flex: 1 }} />
                {loading ? (
                  <TouchableOpacity style={styles.stopBtn} onPress={stop} activeOpacity={0.8}>
                    <View style={styles.stopSquare} />
                  </TouchableOpacity>
                ) : (
                  <SkiaSendButton
                    onPress={send}
                    disabled={!input.trim()}
                    label="↑"
                  />
                )}
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>

        {/* Voice Input Bubble */}
        <VoiceInputBubble
          visible={voiceVisible}
          onClose={() => setVoiceVisible(false)}
          onSubmit={(text) => { setInput(text); setTimeout(() => send(text), 100); }}
        />

        {/* Transaction Preview Modal — always shown for high-risk; otherwise gated by confirmStyle */}
        {pendingTx && (confirmStyle === "panel" || isHighRiskTx(pendingTx)) && (
          <TransactionPreview
            transaction={pendingTx}
            onConfirm={() => confirmTransaction(pendingTx)}
            onCancel={() => setPendingTx(null)}
            solPrice={solPrice}
          />
        )}

        {/* History Sheet */}
        <HistorySheet
          visible={historyVisible}
          walletAddress={walletAddress}
          onClose={() => setHistoryVisible(false)}
          onLoadConversation={handleLoadConversation}
          onNewChat={newChat}
        />

        {/* Positions Sheet */}
        <PositionsSheet
          visible={positionsVisible}
          walletAddress={walletAddress}
          onClose={() => setPositionsVisible(false)}
        />

        {/* Risk snapshot cards render inline in the chat message list */}

        {/* Onboarding */}
        <OnboardingSheet
          visible={onboardingVisible}
          onClose={() => setOnboardingVisible(false)}
          onTryMessage={(msg) => { setOnboardingVisible(false); send(msg); }}
          onModeSelected={(mode) => setTradeMode(mode)}
        />

        {/* Sandbox Dashboard */}
        <SandboxDashboard
          visible={sandboxDashVisible}
          sandboxState={sandboxState}
          walletAddress={walletAddress}
          onClose={() => setSandboxDashVisible(false)}
          onReset={handleSandboxReset}
        />

        {/* Autopilot config sheet */}
        <AutopilotSheet
          visible={autopilotVisible}
          walletAddress={walletAddress}
          onClose={() => setAutopilotVisible(false)}
          onSaved={(cfg) => {
            setAutopilotConfig(cfg);
            loadConfirmThreshold().then(setConfirmThresholdUsd).catch(() => {});
            loadProfile(walletAddress).then(setUserProfile).catch(() => {});
          }}
        />

        {/* Risk profile setup — shown once on first use */}
        <RiskProfileSheet
          visible={showRiskSheet}
          walletAddress={walletAddress}
          canSkip={true}
          onDone={(profile) => {
            setShowRiskSheet(false);
            setUserProfile(profile);
          }}
        />
      </SafeAreaView>
    </View>
  );
}

// ─── Markdown styles for Homie messages ──────────────────────────────────────
const TEXT_PRI_MD   = "#FFFFFF";
const TEXT_SEC_MD   = "rgba(255,255,255,0.65)";
const GREEN_MD      = "#4ADE80";
const GLASS_MD      = "rgba(255,255,255,0.06)";
const GLASS_BDR_MD  = "rgba(255,255,255,0.12)";

const tableRules = {
  table: (node, children, parent, styles) => (
    <ScrollView key={node.key} horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8 }}>
      <View style={{ borderWidth: 1, borderColor: GLASS_BDR_MD, borderRadius: 8, overflow: "hidden" }}>
        {children}
      </View>
    </ScrollView>
  ),
  link: (node, children, parent, styles) => (
    <Text key={node.key} style={{ color: GREEN_MD }} onPress={() => Linking.openURL(node.attributes.href)}>
      {children}
    </Text>
  ),
};

const markdownStyles = {
  body:        { color: TEXT_PRI_MD, fontSize: 15, lineHeight: 24, fontFamily: F.regular },
  paragraph:   { color: TEXT_PRI_MD, fontSize: 15, lineHeight: 24, marginVertical: 2, fontFamily: F.regular },
  strong:      { color: TEXT_PRI_MD, fontFamily: F.bold },
  em:          { color: TEXT_SEC_MD, fontStyle: "italic" },
  // Tables
  table:       { borderWidth: 1, borderColor: GLASS_BDR_MD, borderRadius: 8, marginVertical: 8, overflow: "hidden" },
  thead:       { backgroundColor: "rgba(255,255,255,0.08)" },
  th:          { color: GREEN_MD, fontSize: 12, fontFamily: F.headSemi, paddingHorizontal: 10, paddingVertical: 7, borderRightWidth: 1, borderRightColor: GLASS_BDR_MD, minWidth: 90 },
  tr:          { borderBottomWidth: 1, borderBottomColor: GLASS_BDR_MD, flexDirection: "row" },
  td:          { color: TEXT_PRI_MD, fontSize: 12, fontFamily: F.regular, paddingHorizontal: 10, paddingVertical: 7, borderRightWidth: 1, borderRightColor: GLASS_BDR_MD, minWidth: 90 },
  // Code
  code_inline: { backgroundColor: "rgba(255,255,255,0.1)", color: GREEN_MD, borderRadius: 4, paddingHorizontal: 4, fontFamily: "monospace", fontSize: 13 },
  code_block:  { backgroundColor: "rgba(0,0,0,0.4)", color: GREEN_MD, borderRadius: 8, padding: 10, fontFamily: "monospace", fontSize: 12 },
  fence:       { backgroundColor: "rgba(0,0,0,0.4)", color: GREEN_MD, borderRadius: 8, padding: 10, fontFamily: "monospace", fontSize: 12 },
  // Lists
  bullet_list: { marginVertical: 4 },
  ordered_list:{ marginVertical: 4 },
  list_item:   { color: TEXT_PRI_MD, fontSize: 15, lineHeight: 24, fontFamily: F.regular },
  // Headings — Space Grotesk
  heading1:    { color: TEXT_PRI_MD, fontSize: 18, fontFamily: F.headBold, marginVertical: 6 },
  heading2:    { color: TEXT_PRI_MD, fontSize: 16, fontFamily: F.headSemi, marginVertical: 4 },
  heading3:    { color: GREEN_MD,    fontSize: 14, fontFamily: F.headSemi, marginVertical: 3 },
  // Blockquote
  blockquote:  { backgroundColor: GLASS_MD, borderLeftWidth: 3, borderLeftColor: GREEN_MD, paddingLeft: 10, marginVertical: 4 },
  link:        { color: GREEN_MD, textDecorationLine: "none" },
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "transparent" },

  // ── Header — handled by SkiaHeaderCard ──

  // ── Chat Container — open, no boxing ──
  chatContainer: {
    flex: 1,
  },

  // ── Messages ──
  messageList: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16, gap: 16 },

  // User bubble — solid green, fintech style
  userRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "flex-end",
    paddingLeft: 52,
    gap: 6,
  },
  userBubble: {
    backgroundColor: "rgba(74,222,128,0.15)",
    borderRadius: 20, borderBottomRightRadius: 5,
    borderWidth: 1, borderColor: "rgba(74,222,128,0.25)",
    paddingHorizontal: 16, paddingVertical: 12,
    maxWidth: "80%",
  },
  userText: { color: "rgba(255,255,255,0.88)", fontSize: 15, lineHeight: 22, fontFamily: F.regular },

  undoBtn: {
    width: 28, height: 28,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  undoBtnIcon: { color: "rgba(255,255,255,0.50)", fontSize: 14 },

  // AI messages — glass card with stronger contrast
  homieRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingRight: 20 },
  avatar: {
    width: 40, height: 40,
    alignItems: "center", justifyContent: "center",
    marginTop: 2, flexShrink: 0,
  },
  avatarText: { color: GREEN, fontSize: 13, fontWeight: "900" },
  homieContent: { flex: 1 },
  homieBubble: {
    backgroundColor: GLASS_MED,
    borderRadius: 20, borderBottomLeftRadius: 5,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  homieText: { color: TEXT_PRI, fontSize: 15, lineHeight: 25, fontFamily: F.regular },

  shimmerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 16,
    paddingVertical: 8,
  },

  // Review & Sign button (panel mode alternative to slider)
  reviewBtn: {
    flexDirection:   "row",
    alignItems:      "center",
    gap:             8,
    alignSelf:       "flex-start",
    marginTop:       12,
    paddingVertical:   12,
    paddingHorizontal: 20,
    backgroundColor:  "rgba(74,222,128,0.10)",
    borderRadius:    50,
    borderWidth:     1,
    borderColor:     "rgba(74,222,128,0.28)",
  },
  reviewBtnText: {
    color:         "#4ADE80",
    fontSize:      14,
    fontFamily:    F.headSemi,
    letterSpacing: -0.1,
  },
  reviewBtnArrow: {
    color:      "#4ADE80",
    fontSize:   16,
    lineHeight: 20,
  },

  // Tip
  tipBox: {
    flexDirection: "row", alignItems: "flex-start",
    backgroundColor: "rgba(251,191,36,0.06)",
    borderRadius: 14, padding: 14, marginTop: 10, gap: 10,
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.15)",
    borderLeftWidth: 3,
    borderLeftColor: WARN,
  },
  tipIconBox: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "rgba(251,191,36,0.12)",
    alignItems: "center", justifyContent: "center",
    flexShrink: 0, marginTop: 1,
  },
  tipIconText: { color: WARN, fontSize: 11, fontWeight: "900" },
  tipText: { color: TEXT_SEC, fontSize: 13, lineHeight: 20, flex: 1, fontFamily: F.regular },

  solscanBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    backgroundColor: "rgba(74,222,128,0.12)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.30)",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  solscanText: { color: GREEN, fontSize: 13, fontFamily: F.semibold },

  // ── Inline choice chips (quick replies embedded in AI bubble) ──
  choicesRow: {
    flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12,
  },
  choiceChip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
    backgroundColor: "rgba(74,222,128,0.10)",
    borderWidth: 1, borderColor: "rgba(74,222,128,0.28)",
  },
  choiceChipText: {
    color: "#4ADE80", fontSize: 13, fontFamily: F.semibold,
  },

  // ── Input Area — glass bar, separated ──
  inputArea: {
    paddingHorizontal: 10, paddingVertical: 10,
    backgroundColor: "transparent",
  },
  inputWrapper: {
    backgroundColor: GLASS,
    borderRadius: 22,
    padding: 6,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
  },
  input: {
    color: TEXT_PRI, fontSize: 15, maxHeight: 110,
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10,
    fontFamily: F.regular,
  },
  actionControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 6,
    paddingHorizontal: 4,
  },
  micBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(74,222,128,0.10)",
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  // ── Positions button — premium compact ──
  positionsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(74,222,128,0.08)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.20)",
  },
  positionsBtnText: {
    color: GREEN,
    fontSize: 12,
    fontFamily: F.headSemi,
    letterSpacing: 0.3,
  },
  positionsFallbackRow: {
    paddingHorizontal: 14,
    paddingBottom: 6,
    alignItems: "flex-start",
  },

  // ── Suggestion chips — collapsible ──
  suggestionsContainer: {
    paddingBottom: 4,
  },
  chipsControlRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 6,
  },
  chipsToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingRight: 8,
  },
  chipsToggleText: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 11,
    fontFamily: F.medium,
  },
  suggestionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    paddingBottom: 6,
    gap: 8,
  },
  suggestionChip: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  suggestionGhost: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginHorizontal: 14,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    maxWidth: "85%",
    gap: 8,
  },
  suggestionGhostText: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 13,
    fontFamily: F.medium,
    flex: 1,
  },
  suggestionGhostTab: {
    color: "rgba(255,255,255,0.20)",
    fontSize: 10,
    fontFamily: F.bold,
    letterSpacing: 0.5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },

  suggestionText: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 13,
    fontFamily: F.medium,
  },

  // Stop button — premium circular, replaces send button position
  stopBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: "rgba(248,113,113,0.12)",
    borderWidth: 1.5,
    borderColor: "rgba(248,113,113,0.35)",
    alignItems: "center", justifyContent: "center",
    // Subtle red glow
    shadowColor: "#F87171",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  stopSquare: {
    width: 14, height: 14, borderRadius: 3,
    backgroundColor: "#F87171",
  },

  // ── Retry button for error messages ──
  retryBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(248,113,113,0.10)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.25)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 6,
  },
  retryBtnText: {
    color: "#F87171",
    fontSize: 13,
    fontFamily: F.semibold,
  },
});
