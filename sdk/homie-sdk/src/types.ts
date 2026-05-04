// ─── SDK Config ──────────────────────────────────────────────────────────────

export interface HomieConfig {
  /** Base URL of the Homie server (no trailing slash) */
  baseUrl: string;
  /** Optional — passed as Authorization header if set */
  token?: string;
  /** Optional — default timeout in ms (default: 30_000) */
  timeout?: number;
}

// ─── Wallet Context ──────────────────────────────────────────────────────────

export type TradeMode = "auto" | "ask" | "learn";

export interface WalletContext {
  walletAddress?: string | null;
  solBalance?: number | null;
  tradeMode?: TradeMode;
  network?: "mainnet" | "devnet";
  userProfile?: Record<string, unknown> | null;
  autopilotConfig?: Record<string, unknown> | null;
  sandboxMode?: boolean;
  sandboxVirtualBalances?: Record<string, number> | null;
}

// ─── Chat ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  message: string;
  wallet?: WalletContext;
  conversationHistory?: ChatMessage[];
}

export type AgentResponseType =
  | "text"
  | "strategy"
  | "transaction"
  | "portfolio_overview"
  | "chart"
  | "sentiment"
  | "rates"
  | "error";

/** Structured response from the Homie agent loop */
export interface AgentResponse {
  /** Main text reply shown to the user */
  text: string;
  type?: AgentResponseType;
  tip?: string;
  strategies?: Strategy[];
  strategyCards?: StrategyCard[];
  transaction?: TransactionPayload | TransactionBundle | null;
  portfolioData?: Portfolio | null;
  multiply?: MultiplyCardData | null;
  /** Whether the server used the fallback (non-agent) path */
  fallback?: boolean;
  [key: string]: unknown;
}

export interface Strategy {
  protocol: string;
  action: string;
  apy?: number;
  risk?: string;
  [key: string]: unknown;
}

export interface StrategyCard {
  protocol: string;
  action: string;
  apy?: number;
  tvl?: number;
  risk?: string;
  amountUsd?: number;
  description?: string;
  [key: string]: unknown;
}

/** Data shape for the Kamino Multiply interactive card */
export interface MultiplyCardData {
  collateral: string;
  collateralAmount: number;
  collateralUsd: number;
  entryPrice: number;
  collateralApy: number;
  debtApy: number;
  suggestedLeverage: number;
  maxLeverage: number;
  liquidationLtv: number;
  isCorrelated: boolean;
  protocol: string;
  market: string;
}

// ─── Transactions ────────────────────────────────────────────────────────────

export interface TransactionPayload {
  serializedTx: string;
  protocol?: string;
  action?: string;
  description?: string;
  estimatedOutput?: string;
  amountUsd?: number;
  [key: string]: unknown;
}

export interface BundleStep {
  stepIndex: number;
  label: string;
  description?: string;
  protocol?: string;
  serializedTx: string;
  /** true = amounts are estimates pending prior step confirmation */
  estimated?: boolean;
}

export interface TransactionBundle {
  type: "transaction_bundle";
  bundleId: string;
  title: string;
  steps: BundleStep[];
  totalSteps: number;
  why?: string;
  [key: string]: unknown;
}

// ─── SSE Stream Events ───────────────────────────────────────────────────────

export interface StreamStatusEvent {
  type: "status";
  text: string;
}

export interface StreamResultEvent {
  type: "result";
  data: AgentResponse;
}

export interface StreamErrorEvent {
  type: "error";
  text: string;
}

export type StreamEvent = StreamStatusEvent | StreamResultEvent | StreamErrorEvent;

// ─── Data endpoints ──────────────────────────────────────────────────────────

export interface TokenBalance {
  mint: string;
  symbol?: string;
  amount: number;
  uiAmount: number;
  decimals: number;
  usdValue?: number;
  [key: string]: unknown;
}

export interface Portfolio {
  solBalance: number;
  tokens: TokenBalance[];
  totalUsdValue?: number;
  [key: string]: unknown;
}

export type ChartRange = "1H" | "24H" | "7D" | "30D" | "1Y";

export interface ChartPoint {
  timestamp: number;
  price: number;
}

export interface ChartData {
  symbol: string;
  range: ChartRange;
  points: ChartPoint[];
  [key: string]: unknown;
}

export interface SentimentResult {
  token: string;
  score: number;
  label: string;
  summary: string;
  sources?: string[];
  [key: string]: unknown;
}

export interface RateInfo {
  protocol: string;
  apy: number;
  [key: string]: unknown;
}

// ─── Monitor — Positions ──────────────────────────────────────────────────────

export type PositionAction = "stake" | "lend" | "lp" | "leverage" | "stablecoin";

export interface Position {
  id: string;
  walletAddress: string;
  protocol: string;
  pair: string;
  action: PositionAction;
  amountUsd: number;
  entrySolPrice: number;
  entryRiskScore: number;
  entryApy: number | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  leverageData?: { collToken: string; debtToken: string; targetLeverage: number } | null;
  createdAt: number;
  active: boolean;
}

export interface RegisterPositionRequest {
  walletAddress: string;
  protocol: string;
  pair?: string;
  action?: PositionAction;
  amountUsd?: number;
  entrySolPrice?: number;
  entryRiskScore?: number;
  entryApy?: number | null;
  rangeLow?: number | null;
  rangeHigh?: number | null;
}

// ─── Monitor — Activity Log ───────────────────────────────────────────────────

export type ActivityType = "auto_execute" | "user_action" | "alert" | "suggestion";
export type ActivityStatus = "success" | "pending" | "failed" | "cancelled";

export interface ActivityEntry {
  id: string;
  walletAddress: string;
  type: ActivityType;
  protocol: string;
  action: string;
  amountUsd: number | null;
  reason: string | null;
  status: ActivityStatus;
  txSignature: string | null;
  timestamp: number;
  autoExecuted: boolean;
}

export interface LogActivityRequest {
  walletAddress: string;
  type?: ActivityType;
  protocol?: string;
  action?: string;
  amountUsd?: number | null;
  reason?: string | null;
  status?: ActivityStatus;
  txSignature?: string | null;
  autoExecuted?: boolean;
}

export interface UpdateActivityRequest {
  status?: ActivityStatus;
  txSignature?: string | null;
  reason?: string | null;
}

// ─── Monitor — Agent Settings ─────────────────────────────────────────────────

export interface AutoExecuteMap {
  compoundRewards?: boolean;
  rebalanceLp?: boolean;
  moveBetweenLending?: boolean;
  autoRepay?: boolean;
}

export interface AgentSettings {
  isPaused: boolean;
  spendingCapUsd: number;
  dailyCapUsd: number;
  autoExecute: AutoExecuteMap;
}

// ─── Monitor — Autopilot ──────────────────────────────────────────────────────

export type AutopilotStrategy = "yield" | "balanced" | "preservation" | "aggressive";

export interface AutopilotConfig {
  enabled: boolean;
  strategy: AutopilotStrategy;
  walletAddress?: string;
  savedAt?: number;
  [key: string]: unknown;
}

// ─── Archetype + Lessons + Streak (Day 1+ home surfaces) ──────────────────────

export type Archetype = "beginner" | "degen";
export type ExplanationDepth = "minimal" | "standard" | "deep";

export type LessonId = string;

export interface LessonSummary {
  id: LessonId;
  title: string;
  emoji: string;
  xp: number;
  unlocked: boolean;
  completed: boolean;
}

export interface LessonProgress {
  walletAddress: string;
  completedLessons: LessonId[];
  unlockedActions: string[];
  totalXp: number;
}

export interface StreakState {
  walletAddress: string;
  currentStreak: number;
  longestStreak: number;
  lastCompletionDate: string | null;
}

export interface IdleSuggestion {
  protocol: string;
  action: string;
  rationale: string;
  estimatedApyPct: number;
  preparedTxStub: TransactionPayload | null;
}

// ─── Onboarding persona ───────────────────────────────────────────────────────

export type OnboardingGoal = "passive_income" | "grow" | "explore";
export type OnboardingVerbosity = "explain" | "key_insight" | "execute_report";
export type OnboardingRisk = "low" | "medium" | "high";

export interface UserPersona {
  walletAddress: string;
  goal: OnboardingGoal;
  verbosity: OnboardingVerbosity;
  risk: OnboardingRisk;
  updatedAt: number;
}

/** @deprecated use UserPersona */
export type UserPreferences = UserPersona;

export interface IdleSuggestionResponse {
  walletAddress: string;
  idleSol: number;
  persona: UserPersona | null;
  suggestion: IdleSuggestion | null;
}

export interface HomeSnapshot {
  walletAddress: string;
  archetype: Archetype | null;
  idleBalanceUsd: number;
  openPositions: Position[];
  topSuggestion: IdleSuggestion | null;
  lessonProgress: LessonProgress | null;
  streak: StreakState | null;
  dailyStatStub: { ready: boolean } | null;
}

export interface CompleteLessonRequest {
  walletAddress: string;
  lessonId: LessonId;
  unlockKey?: string;
}

export interface CompleteLessonResponse {
  success: true;
  progress: LessonProgress;
  streak: StreakState;
}
