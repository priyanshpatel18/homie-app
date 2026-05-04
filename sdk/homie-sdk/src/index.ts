// ─── @homie/sdk ──────────────────────────────────────────────────────────────
// Client SDK for the Homie AI agent backend.
// Works in React Native and web. Zero runtime dependencies.

// Core
export { init, getConfig, request, HomieApiError } from "./client";
export type { RequestOptions } from "./client";

// Chat
export { chat, chatStream, conversation } from "./chat";
export type { StreamCallbacks } from "./chat";

// Data
export {
  fetchPortfolio,
  fetchPrices,
  fetchChart,
  fetchRates,
  fetchSentiment,
  fetchEmbedding,
} from "./data";

// Monitor
export {
  fetchPositions,
  registerPosition,
  closePosition,
  fetchActivityLog,
  logActivity,
  updateActivity,
  fetchAgentSettings,
  saveAgentSettings,
  fetchAutopilot,
  saveAutopilot,
} from "./monitor";

// Home
export {
  fetchHomeSnapshot,
  fetchStreak,
  savePreferences,
  fetchPreferences,
  fetchIdleSuggestion,
} from "./home";

// Lessons
export { fetchLessonTree, completeLesson } from "./lessons";

// Types — re-export everything so consumers can import from one place
export type {
  // Config
  HomieConfig,
  // Wallet
  WalletContext,
  TradeMode,
  // Chat
  ChatMessage,
  ChatRequest,
  AgentResponse,
  AgentResponseType,
  Strategy,
  StrategyCard,
  // Transactions
  TransactionPayload,
  TransactionBundle,
  BundleStep,
  // Stream
  StreamEvent,
  StreamStatusEvent,
  StreamResultEvent,
  StreamErrorEvent,
  // Data
  Portfolio,
  TokenBalance,
  ChartRange,
  ChartPoint,
  ChartData,
  SentimentResult,
  RateInfo,
  // Monitor — positions
  Position,
  PositionAction,
  RegisterPositionRequest,
  // Monitor — activity
  ActivityEntry,
  ActivityType,
  ActivityStatus,
  LogActivityRequest,
  UpdateActivityRequest,
  // Monitor — settings
  AgentSettings,
  AutoExecuteMap,
  // Monitor — autopilot
  AutopilotConfig,
  AutopilotStrategy,
  // Archetype + Lessons + Streak
  Archetype,
  ExplanationDepth,
  LessonId,
  LessonSummary,
  LessonProgress,
  StreakState,
  IdleSuggestion,
  IdleSuggestionResponse,
  HomeSnapshot,
  // Onboarding
  OnboardingGoal,
  OnboardingVerbosity,
  UserPreferences,
  CompleteLessonRequest,
  CompleteLessonResponse,
} from "./types";
