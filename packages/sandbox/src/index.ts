// ─── @homie/sandbox ─────────────────────────────────────────────────────────
// Pure simulation engine plus storage-agnostic virtual portfolio for Practice
// mode. Configure storage and backend URL once at app boot, then call the
// simulate* / loadSandboxState / saveSandboxState helpers.

export {
  configureSandboxStorage,
  configureSandbox,
} from "./storage";
export type { StorageAdapter, SandboxConfig } from "./storage";

export {
  TOKEN_MINTS,
  DISPLAY_SYMBOL,
  displaySym,
  normSym,
  fetchJupiterQuote,
  fetchTokenPricesUsd,
  simulateSwap,
  simulateStake,
  simulateUnstake,
  simulateLend,
  simulateWithdrawLend,
  simulateLeverage,
  simulateLpOpen,
  simulateLpClose,
  updateYield,
  calculatePnL,
  parseTxAction,
} from "./engine";

export {
  createFreshState,
  loadSandboxState,
  saveSandboxState,
  resetSandboxState,
} from "./state";

export type {
  TokenSymbol,
  SandboxBalances,
  SandboxState,
  SandboxHistoryEntry,
  PerformanceSnapshot,
  LendingPositionState,
  LeveragePositionState,
  LpPositionState,
  SandboxOk,
  SandboxErr,
  SandboxOutcome,
  SandboxSwapResult,
  SandboxLendResult,
  SandboxWithdrawResult,
  SandboxLeverageResult,
  SandboxLpOpenResult,
  SandboxLpCloseResult,
  CalculatePnlResult,
  PnlBreakdownEntry,
  ParsedTxAction,
} from "./types";
