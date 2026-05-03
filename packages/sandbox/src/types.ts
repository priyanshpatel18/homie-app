export type TokenSymbol =
  | "SOL"
  | "USDC"
  | "USDT"
  | "MSOL"
  | "JUP"
  | "BONK"
  | "WIF"
  | "RAY"
  | "ORCA";

export interface SandboxBalances {
  [token: string]: number;
}

export interface LendingPositionState {
  amount: number;
  apy: number;
  entryTimestamp: number;
  lastYieldTimestamp: number;
}

export interface LeveragePositionState {
  id: string;
  token: string;
  depositAmount: number;
  leverage: number;
  entryPrice: number;
  liquidationPrice: number | null;
  timestamp: number;
}

export interface LpPositionState {
  id: string;
  tokenA: string;
  tokenB: string;
  amountA: number;
  amountB: number;
  protocol: string;
  timestamp: number;
}

export interface PerformanceSnapshot {
  timestamp: number;
  valueUsd: number;
}

export interface SandboxHistoryEntry {
  id: string;
  type:
    | "swap"
    | "stake"
    | "unstake"
    | "lend"
    | "withdraw"
    | "leverage"
    | "lp_open"
    | "lp_close";
  timestamp: number;
  [key: string]: unknown;
}

export interface SandboxState {
  balances: SandboxBalances;
  initialValueUsd: number | null;
  history: SandboxHistoryEntry[];
  performanceSnapshots: PerformanceSnapshot[];
  yieldTimestamps: Record<string, number>;
  createdAt: number;
  lendingPositions?: Record<string, LendingPositionState>;
  leveragePositions?: LeveragePositionState[];
  lpPositions?: LpPositionState[];
}

export interface SandboxSwapResult {
  type: "sandbox_swap";
  from: string;
  to: string;
  fromAmount: number;
  toAmount: number;
  priceImpact: string;
  routeCount: number;
}

export interface SandboxLendResult {
  type: "sandbox_lend";
  token: string;
  amount: number;
  apy: string;
}

export interface SandboxWithdrawResult {
  type: "sandbox_withdraw";
  token: string;
  amount: number;
  interest: number;
}

export interface SandboxLeverageResult {
  type: "sandbox_leverage";
  token: string;
  depositAmount: number;
  leverage: number;
  liquidationPrice: number | null;
  entryPrice: number;
}

export interface SandboxLpOpenResult {
  type: "sandbox_lp_open";
  tokenA: string;
  tokenB: string;
  amountA: number;
  amountB: number;
  protocol: string;
}

export interface SandboxLpCloseResult {
  type: "sandbox_lp_close";
  tokenA: string;
  tokenB: string;
}

export type SandboxOk<T> = { newState: SandboxState; result: T; error?: undefined };
export type SandboxErr = { error: string; newState?: undefined; result?: undefined };
export type SandboxOutcome<T> = SandboxOk<T> | SandboxErr;

export interface PnlBreakdownEntry {
  balance?: number;
  price: number;
  usdValue: number;
  type?: "lending" | "leverage" | "lp";
  leverage?: number;
  tokenA?: string;
  tokenB?: string;
}

export interface CalculatePnlResult {
  totalUsd: number;
  pnlAbsolute: number;
  pnlPercent: number;
  breakdown: Record<string, PnlBreakdownEntry>;
}

export type ParsedTxAction =
  | { type: "swap"; amount: number; from: string; to: string }
  | { type: "stake"; amount: number }
  | { type: "unstake"; amount: number }
  | { type: "lend"; amount: number; token: string }
  | { type: "withdraw"; amount: number; token: string }
  | { type: "leverage"; leverage: number; depositAmount: number; token: string }
  | { type: "leverage_close" }
  | { type: "lp_open"; tokenA: string; tokenB: string; amountA: number };
