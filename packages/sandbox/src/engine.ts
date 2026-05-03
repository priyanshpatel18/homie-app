/**
 * Pure simulation logic. All price data comes from Jupiter; no blockchain
 * calls, no wallet interaction.
 */

import { getBackendUrl } from "./storage";
import type {
  SandboxState,
  SandboxBalances,
  SandboxHistoryEntry,
  LendingPositionState,
  LeveragePositionState,
  LpPositionState,
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

// ─── AbortSignal.timeout polyfill for React Native / Hermes ─────────────────
function timeoutSignal(ms: number): AbortSignal {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

// ─── Token registry ──────────────────────────────────────────────────────────
export const TOKEN_MINTS: Record<string, string> = {
  SOL: "So11111111111111111111111111111111111111112",
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  MSOL: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
  JUP: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  WIF: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
  RAY: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
  ORCA: "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",
};

export const DISPLAY_SYMBOL: Record<string, string> = { MSOL: "mSOL" };
export function displaySym(sym: string): string {
  return DISPLAY_SYMBOL[sym] ?? sym;
}

const TOKEN_DECIMALS: Record<string, number> = {
  SOL: 9,
  USDC: 6,
  USDT: 6,
  MSOL: 9,
  JUP: 6,
  BONK: 5,
  WIF: 6,
  RAY: 6,
  ORCA: 6,
};

const YIELD_RATES: Record<string, number> = { MSOL: 0.067 };
const LENDING_APYS: Record<string, number> = { USDC: 0.085, SOL: 0.04, USDT: 0.08 };

const SOL_GAS_RESERVE = 0.005;
const SANDBOX_GAS_FEE = 0.00025;

export function normSym(s: string | null | undefined): string | null {
  if (!s) return null;
  const u = s.toUpperCase();
  if (u === "MSOL" || s === "mSOL") return "MSOL";
  if (TOKEN_MINTS[u]) return u;
  for (const [sym, mint] of Object.entries(TOKEN_MINTS)) {
    if (mint === s) return sym;
  }
  return u;
}

interface JupiterQuoteResponse {
  outAmount: string;
  priceImpactPct?: string;
  routePlan?: unknown[];
  error?: string;
}

export async function fetchJupiterQuote(
  inMint: string,
  outMint: string,
  amountRaw: number,
): Promise<JupiterQuoteResponse> {
  const url = new URL("https://lite-api.jup.ag/swap/v1/quote");
  url.searchParams.set("inputMint", inMint);
  url.searchParams.set("outputMint", outMint);
  url.searchParams.set("amount", amountRaw.toString());
  url.searchParams.set("slippageBps", "50");

  const res = await fetch(url.toString(), { signal: timeoutSignal(10_000) });
  if (!res.ok) throw new Error(`Jupiter quote HTTP ${res.status}`);
  const data = (await res.json()) as JupiterQuoteResponse;
  if (data.error) throw new Error(data.error);
  return data;
}

interface PriceCache {
  data: Record<string, number>;
  fetchedAt: number;
  TTL: number;
}

const PRICE_CACHE: PriceCache = { data: {}, fetchedAt: 0, TTL: 30_000 };

async function fetchSolPriceViaBinance(): Promise<number> {
  const res = await fetch(
    "https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT",
    { signal: timeoutSignal(5_000) },
  );
  if (!res.ok) throw new Error(`Binance HTTP ${res.status}`);
  const data = (await res.json()) as { price: string };
  const price = parseFloat(data.price);
  if (!(price > 0)) throw new Error("Invalid Binance price");
  return price;
}

export async function fetchTokenPricesUsd(
  symbols: (string | null | undefined)[],
): Promise<Record<string, number>> {
  if (Date.now() - PRICE_CACHE.fetchedAt < PRICE_CACHE.TTL) return PRICE_CACHE.data;

  const keys = [...new Set(symbols.map(normSym).filter((s): s is string => !!s))];
  const out: Record<string, number> = { USDC: 1.0, USDT: 1.0 };

  if (keys.includes("SOL")) {
    try {
      out.SOL = await fetchSolPriceViaBinance();
    } catch {
      if (PRICE_CACHE.data.SOL && PRICE_CACHE.data.SOL > 0) out.SOL = PRICE_CACHE.data.SOL;
    }
  }

  const otherKeys = keys.filter((k) => k !== "SOL" && k !== "USDC" && k !== "USDT");
  const otherMints = otherKeys.map((k) => TOKEN_MINTS[k]).filter((m): m is string => !!m);

  if (otherMints.length) {
    try {
      const res = await fetch(
        `${getBackendUrl()}/api/prices?mints=${otherMints.join(",")}`,
        { signal: timeoutSignal(8_000) },
      );
      if (!res.ok) throw new Error(`Backend HTTP ${res.status}`);
      const prices = (await res.json()) as Record<string, number>;
      for (const key of otherKeys) {
        const mint = TOKEN_MINTS[key];
        if (!mint) continue;
        const price = prices[mint];
        if (price && price > 0) out[key] = price;
      }
    } catch {
      for (const k of otherKeys) {
        const cached = PRICE_CACHE.data[k];
        if (cached && cached > 0) out[k] = cached;
      }
    }
  }

  if (keys.includes("MSOL") && !out.MSOL && out.SOL) {
    out.MSOL = out.SOL * 1.025;
  }

  PRICE_CACHE.data = out;
  PRICE_CACHE.fetchedAt = Date.now();
  return out;
}

// ─── simulateSwap ────────────────────────────────────────────────────────────
export async function simulateSwap(
  state: SandboxState,
  fromRaw: string,
  toRaw: string,
  amount: number,
): Promise<SandboxOutcome<SandboxSwapResult>> {
  const inSym = normSym(fromRaw);
  const outSym = normSym(toRaw);

  if (!inSym) return { error: `Unknown token: ${fromRaw}` };
  if (!outSym) return { error: `Unknown token: ${toRaw}` };

  const inMint = TOKEN_MINTS[inSym];
  const outMint = TOKEN_MINTS[outSym];

  if (!inMint) return { error: `Unknown token: ${fromRaw}` };
  if (!outMint) return { error: `Unknown token: ${toRaw}` };

  const currentBalance = state.balances[inSym] ?? 0;
  const maxUsable =
    inSym === "SOL" ? Math.max(0, currentBalance - SOL_GAS_RESERVE) : currentBalance;

  if (amount <= 0) return { error: "Amount must be greater than 0" };
  if (amount > maxUsable) {
    if (inSym === "SOL") {
      return {
        error: `Insufficient SOL. Max usable: ${maxUsable.toFixed(4)} SOL (keeping ${SOL_GAS_RESERVE} for gas).`,
      };
    }
    return {
      error: `Insufficient ${displaySym(inSym)}. Balance: ${currentBalance.toFixed(6)}`,
    };
  }

  const inDecimals = TOKEN_DECIMALS[inSym] ?? 9;
  const outDecimals = TOKEN_DECIMALS[outSym] ?? 6;
  const amountRaw = Math.floor(amount * 10 ** inDecimals);

  let outputAmount: number;
  let priceImpact: number;
  let routeCount: number;
  try {
    const quote = await fetchJupiterQuote(inMint, outMint, amountRaw);
    outputAmount = parseInt(quote.outAmount, 10) / 10 ** outDecimals;
    priceImpact = parseFloat(quote.priceImpactPct ?? "0");
    routeCount = quote.routePlan?.length ?? 1;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `Jupiter quote failed: ${msg}` };
  }

  const newBalances: SandboxBalances = { ...state.balances };
  newBalances[inSym] = (newBalances[inSym] ?? 0) - amount;
  newBalances[outSym] = (newBalances[outSym] ?? 0) + outputAmount;
  if (inSym !== "SOL") {
    newBalances.SOL = Math.max(0, (newBalances.SOL ?? 0) - SANDBOX_GAS_FEE);
  }

  for (const k of Object.keys(newBalances)) {
    if (newBalances[k]! < 1e-9) delete newBalances[k];
  }

  const entry: SandboxHistoryEntry = {
    id: Date.now().toString(),
    type: "swap",
    from: inSym,
    to: outSym,
    fromAmount: amount,
    toAmount: outputAmount,
    priceImpact,
    routeCount,
    timestamp: Date.now(),
  };

  return {
    newState: {
      ...state,
      balances: newBalances,
      history: [entry, ...(state.history ?? [])].slice(0, 100),
    },
    result: {
      type: "sandbox_swap",
      from: displaySym(inSym),
      to: displaySym(outSym),
      fromAmount: amount,
      toAmount: outputAmount,
      priceImpact: priceImpact.toFixed(3),
      routeCount,
    },
  };
}

export function simulateStake(
  state: SandboxState,
  amountSol: number,
): Promise<SandboxOutcome<SandboxSwapResult>> {
  return simulateSwap(state, "SOL", "MSOL", amountSol);
}

export function simulateUnstake(
  state: SandboxState,
  amountMsol: number,
): Promise<SandboxOutcome<SandboxSwapResult>> {
  return simulateSwap(state, "MSOL", "SOL", amountMsol);
}

export function simulateLend(
  state: SandboxState,
  tokenRaw: string,
  amount: number,
  apy?: number,
): SandboxOutcome<SandboxLendResult> {
  const token = normSym(tokenRaw);
  if (!token) return { error: `Unknown token: ${tokenRaw}` };

  const balance = state.balances[token] ?? 0;
  const maxUsable = token === "SOL" ? Math.max(0, balance - SOL_GAS_RESERVE) : balance;

  if (amount <= 0) return { error: "Amount must be greater than 0" };
  if (amount > maxUsable) {
    return {
      error: `Insufficient ${displaySym(token)}. Balance: ${balance.toFixed(6)}`,
    };
  }

  const effectiveApy = apy ?? LENDING_APYS[token] ?? 0.05;
  const now = Date.now();

  const newBalances: SandboxBalances = { ...state.balances };
  newBalances[token] = (newBalances[token] ?? 0) - amount;
  if (token !== "SOL") {
    newBalances.SOL = Math.max(0, (newBalances.SOL ?? 0) - SANDBOX_GAS_FEE);
  }

  const existing = state.lendingPositions?.[token];
  const newLendingPositions: Record<string, LendingPositionState> = {
    ...(state.lendingPositions ?? {}),
    [token]: {
      amount: (existing?.amount ?? 0) + amount,
      apy: effectiveApy,
      entryTimestamp: existing?.entryTimestamp ?? now,
      lastYieldTimestamp: existing?.lastYieldTimestamp ?? now,
    },
  };

  const entry: SandboxHistoryEntry = {
    id: now.toString(),
    type: "lend",
    token: displaySym(token),
    amount,
    apy: effectiveApy,
    timestamp: now,
  };

  return {
    newState: {
      ...state,
      balances: newBalances,
      lendingPositions: newLendingPositions,
      history: [entry, ...(state.history ?? [])].slice(0, 100),
    },
    result: {
      type: "sandbox_lend",
      token: displaySym(token),
      amount,
      apy: (effectiveApy * 100).toFixed(1),
    },
  };
}

export function simulateWithdrawLend(
  state: SandboxState,
  tokenRaw: string,
  amount: number,
): SandboxOutcome<SandboxWithdrawResult> {
  const token = normSym(tokenRaw);
  if (!token) return { error: `Unknown token: ${tokenRaw}` };

  const pos = state.lendingPositions?.[token];
  if (!pos || pos.amount <= 0) {
    return { error: `No ${displaySym(token)} lending position found` };
  }

  const withdrawAmt = Math.min(amount, pos.amount);
  const now = Date.now();
  const elapsed =
    (now - (pos.lastYieldTimestamp || pos.entryTimestamp || now)) /
    (365.25 * 24 * 3600 * 1000);
  const interest = withdrawAmt * pos.apy * elapsed;

  const newBalances: SandboxBalances = { ...state.balances };
  newBalances[token] = (newBalances[token] ?? 0) + withdrawAmt + interest;
  if (token !== "SOL") {
    newBalances.SOL = Math.max(0, (newBalances.SOL ?? 0) - SANDBOX_GAS_FEE);
  }

  const remaining = pos.amount - withdrawAmt;
  const newLendingPositions: Record<string, LendingPositionState> = {
    ...(state.lendingPositions ?? {}),
  };
  if (remaining < 1e-9) {
    delete newLendingPositions[token];
  } else {
    newLendingPositions[token] = { ...pos, amount: remaining, lastYieldTimestamp: now };
  }

  const entry: SandboxHistoryEntry = {
    id: now.toString(),
    type: "withdraw",
    token: displaySym(token),
    amount: withdrawAmt,
    interest,
    timestamp: now,
  };

  return {
    newState: {
      ...state,
      balances: newBalances,
      lendingPositions: newLendingPositions,
      history: [entry, ...(state.history ?? [])].slice(0, 100),
    },
    result: {
      type: "sandbox_withdraw",
      token: displaySym(token),
      amount: withdrawAmt,
      interest,
    },
  };
}

export function simulateLeverage(
  state: SandboxState,
  tokenRaw: string,
  depositAmount: number,
  leverage: number,
  entryPrice: number,
): SandboxOutcome<SandboxLeverageResult> {
  const token = normSym(tokenRaw);
  if (!token) return { error: `Unknown token: ${tokenRaw}` };

  const balance = state.balances[token] ?? 0;
  const maxUsable = token === "SOL" ? Math.max(0, balance - SOL_GAS_RESERVE) : balance;

  if (depositAmount <= 0) return { error: "Deposit amount must be greater than 0" };
  if (depositAmount > maxUsable) {
    return {
      error: `Insufficient ${displaySym(token)}. Balance: ${balance.toFixed(4)}`,
    };
  }

  const liqPrice =
    entryPrice && leverage > 1
      ? +((entryPrice * (leverage - 1)) / (leverage * 0.82)).toFixed(2)
      : null;
  const now = Date.now();
  const id = now.toString();

  const newBalances: SandboxBalances = { ...state.balances };
  newBalances[token] = (newBalances[token] ?? 0) - depositAmount;
  if (token !== "SOL") {
    newBalances.SOL = Math.max(0, (newBalances.SOL ?? 0) - SANDBOX_GAS_FEE);
  }

  const position: LeveragePositionState = {
    id,
    token: displaySym(token),
    depositAmount,
    leverage,
    entryPrice,
    liquidationPrice: liqPrice,
    timestamp: now,
  };
  const entry: SandboxHistoryEntry = { ...position, type: "leverage" };

  return {
    newState: {
      ...state,
      balances: newBalances,
      leveragePositions: [...(state.leveragePositions ?? []), position],
      history: [entry, ...(state.history ?? [])].slice(0, 100),
    },
    result: {
      type: "sandbox_leverage",
      token: displaySym(token),
      depositAmount,
      leverage,
      liquidationPrice: liqPrice,
      entryPrice,
    },
  };
}

export function simulateLpOpen(
  state: SandboxState,
  tokenARaw: string,
  amountA: number,
  tokenBRaw: string,
  amountB: number,
  protocol: string = "Orca",
): SandboxOutcome<SandboxLpOpenResult> {
  const tokenA = normSym(tokenARaw);
  const tokenB = normSym(tokenBRaw);
  if (!tokenA) return { error: `Unknown token: ${tokenARaw}` };
  if (!tokenB) return { error: `Unknown token: ${tokenBRaw}` };

  const balA = state.balances[tokenA] ?? 0;
  const balB = state.balances[tokenB] ?? 0;
  const maxA = tokenA === "SOL" ? Math.max(0, balA - SOL_GAS_RESERVE) : balA;
  const maxB = tokenB === "SOL" ? Math.max(0, balB - SOL_GAS_RESERVE) : balB;

  if (amountA > maxA) {
    return { error: `Insufficient ${displaySym(tokenA)}. Balance: ${balA.toFixed(4)}` };
  }
  if (amountB > 0 && amountB > maxB) {
    return { error: `Insufficient ${displaySym(tokenB)}. Balance: ${balB.toFixed(4)}` };
  }

  const now = Date.now();
  const id = now.toString();
  const newBalances: SandboxBalances = { ...state.balances };
  newBalances[tokenA] = (newBalances[tokenA] ?? 0) - amountA;
  if (amountB > 0) newBalances[tokenB] = (newBalances[tokenB] ?? 0) - amountB;
  newBalances.SOL = Math.max(0, (newBalances.SOL ?? 0) - SANDBOX_GAS_FEE);

  const position: LpPositionState = {
    id,
    tokenA: displaySym(tokenA),
    tokenB: displaySym(tokenB),
    amountA,
    amountB,
    protocol,
    timestamp: now,
  };
  const entry: SandboxHistoryEntry = { ...position, type: "lp_open" };

  return {
    newState: {
      ...state,
      balances: newBalances,
      lpPositions: [...(state.lpPositions ?? []), position],
      history: [entry, ...(state.history ?? [])].slice(0, 100),
    },
    result: {
      type: "sandbox_lp_open",
      tokenA: displaySym(tokenA),
      tokenB: displaySym(tokenB),
      amountA,
      amountB,
      protocol,
    },
  };
}

export function simulateLpClose(
  state: SandboxState,
  lpId: string,
): SandboxOutcome<SandboxLpCloseResult> {
  const pos = (state.lpPositions ?? []).find((p) => p.id === lpId);
  if (!pos) return { error: "LP position not found" };

  const tokenA = normSym(pos.tokenA);
  const tokenB = normSym(pos.tokenB);
  if (!tokenA || !tokenB) return { error: "Unknown token in LP position" };

  const now = Date.now();

  const newBalances: SandboxBalances = { ...state.balances };
  newBalances[tokenA] = (newBalances[tokenA] ?? 0) + pos.amountA;
  if (pos.amountB > 0) newBalances[tokenB] = (newBalances[tokenB] ?? 0) + pos.amountB;
  newBalances.SOL = Math.max(0, (newBalances.SOL ?? 0) - SANDBOX_GAS_FEE);

  const entry: SandboxHistoryEntry = {
    id: now.toString(),
    type: "lp_close",
    tokenA: pos.tokenA,
    tokenB: pos.tokenB,
    amountA: pos.amountA,
    amountB: pos.amountB,
    timestamp: now,
  };

  return {
    newState: {
      ...state,
      balances: newBalances,
      lpPositions: (state.lpPositions ?? []).filter((p) => p.id !== lpId),
      history: [entry, ...(state.history ?? [])].slice(0, 100),
    },
    result: { type: "sandbox_lp_close", tokenA: pos.tokenA, tokenB: pos.tokenB },
  };
}

// ─── updateYield ─────────────────────────────────────────────────────────────
export function updateYield(state: SandboxState): {
  newState: SandboxState;
  yieldGains: Record<string, number>;
} {
  const now = Date.now();
  const newBalances: SandboxBalances = { ...state.balances };
  const newTimestamps: Record<string, number> = { ...(state.yieldTimestamps ?? {}) };
  const yieldGains: Record<string, number> = {};

  for (const [token, apy] of Object.entries(YIELD_RATES)) {
    if (!newBalances[token]) continue;
    const lastMs = newTimestamps[token] || state.createdAt || now;
    const years = (now - lastMs) / (365.25 * 24 * 3600 * 1000);
    const gain = newBalances[token]! * (Math.exp(apy * years) - 1);
    if (gain > 1e-12) {
      newBalances[token] = (newBalances[token] ?? 0) + gain;
      yieldGains[token] = gain;
    }
    newTimestamps[token] = now;
  }

  const newLendingPositions: Record<string, LendingPositionState> = {
    ...(state.lendingPositions ?? {}),
  };
  for (const [token, pos] of Object.entries(newLendingPositions)) {
    if (!pos?.amount || !pos?.apy) continue;
    const lastMs = pos.lastYieldTimestamp || pos.entryTimestamp || now;
    const years = (now - lastMs) / (365.25 * 24 * 3600 * 1000);
    const gain = pos.amount * (Math.exp(pos.apy * years) - 1);
    if (gain > 1e-12) {
      newLendingPositions[token] = {
        ...pos,
        amount: pos.amount + gain,
        lastYieldTimestamp: now,
      };
      yieldGains[`lend_${token}`] = gain;
    }
  }

  return {
    newState: {
      ...state,
      balances: newBalances,
      yieldTimestamps: newTimestamps,
      lendingPositions: newLendingPositions,
    },
    yieldGains,
  };
}

// ─── calculatePnL ────────────────────────────────────────────────────────────
export function calculatePnL(
  state: SandboxState,
  prices: Record<string, number>,
): CalculatePnlResult {
  let totalUsd = 0;
  const breakdown: Record<string, PnlBreakdownEntry> = {};

  for (const [sym, balance] of Object.entries(state.balances)) {
    const price = prices[sym] ?? 0;
    const usdValue = balance * price;
    totalUsd += usdValue;
    breakdown[sym] = { balance, price, usdValue };
  }

  for (const [sym, pos] of Object.entries(state.lendingPositions ?? {})) {
    if (!pos?.amount) continue;
    const norm = normSym(sym);
    const price = prices[sym] ?? (norm ? prices[norm] : undefined) ?? 1;
    const usdValue = pos.amount * price;
    totalUsd += usdValue;
    breakdown[`lend_${sym}`] = { balance: pos.amount, price, usdValue, type: "lending" };
  }

  for (const pos of state.leveragePositions ?? []) {
    const sym = normSym(pos.token);
    if (!sym) continue;
    const price = prices[sym] ?? 0;
    if (!price) continue;
    const notional = pos.depositAmount * pos.leverage;
    const debt = pos.depositAmount * (pos.leverage - 1);
    const equity = notional * (price / (pos.entryPrice || price)) - debt * 1;
    const usdValue = Math.max(0, equity * price);
    totalUsd += usdValue;
    breakdown[`leverage_${pos.id}`] = {
      balance: pos.depositAmount,
      price,
      usdValue,
      type: "leverage",
      leverage: pos.leverage,
    };
  }

  for (const pos of state.lpPositions ?? []) {
    const symA = normSym(pos.tokenA);
    const symB = normSym(pos.tokenB);
    const priceA = symA ? (prices[symA] ?? 0) : 0;
    const priceB = symB
      ? (prices[symB] ?? (symB === "USDC" || symB === "USDT" ? 1 : 0))
      : 0;
    const usdValue = pos.amountA * priceA + (pos.amountB ?? 0) * priceB;
    totalUsd += usdValue;
    breakdown[`lp_${pos.id}`] = {
      price: priceA,
      usdValue,
      type: "lp",
      tokenA: pos.tokenA,
      tokenB: pos.tokenB,
    };
  }

  const initial = state.initialValueUsd ?? totalUsd;
  const pnlAbsolute = totalUsd - initial;
  const pnlPercent = initial > 0 ? (pnlAbsolute / initial) * 100 : 0;

  return { totalUsd, pnlAbsolute, pnlPercent, breakdown };
}

// ─── parseTxAction ───────────────────────────────────────────────────────────
export function parseTxAction(tx: { action?: string } | null | undefined): ParsedTxAction | null {
  const action = tx?.action ?? "";

  const swap = action.match(/Swap ([\d.]+) (\w+) → (\w+)/i);
  if (swap) return { type: "swap", amount: +swap[1]!, from: swap[2]!, to: swap[3]! };

  const stake = action.match(/(?:Liquid stake|Stake) ([\d.]+) SOL/i);
  if (stake) return { type: "stake", amount: +stake[1]! };

  const unstake = action.match(/Unstake ([\d.]+) m?SOL/i);
  if (unstake) return { type: "unstake", amount: +unstake[1]! };

  const deposit = action.match(/Deposit ([\d.]+) (\w+) into/i);
  if (deposit) return { type: "lend", amount: +deposit[1]!, token: deposit[2]! };

  const withdraw = action.match(/Withdraw ([\d.]+) (\w+) from/i);
  if (withdraw) return { type: "withdraw", amount: +withdraw[1]!, token: withdraw[2]! };

  const leverage = action.match(/Open ([\d.]+)x leverage on ([\d.]+) (\w+)/i);
  if (leverage) {
    return {
      type: "leverage",
      leverage: +leverage[1]!,
      depositAmount: +leverage[2]!,
      token: leverage[3]!,
    };
  }

  if (/Close leverage position/i.test(action)) return { type: "leverage_close" };

  const lpOpen = action.match(/Open (\w+)-(\w+) LP (?:on|position)/i);
  if (lpOpen) {
    return { type: "lp_open", tokenA: lpOpen[1]!, tokenB: lpOpen[2]!, amountA: 0 };
  }

  const vaultDeposit = action.match(/Deposit ([\d.]+) (\w+) into Meteora vault/i);
  if (vaultDeposit) {
    return { type: "lend", amount: +vaultDeposit[1]!, token: vaultDeposit[2]! };
  }

  return null;
}
