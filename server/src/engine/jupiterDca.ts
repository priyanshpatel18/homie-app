// @ts-nocheck
/**
 * jupiterDca.js — Jupiter Recurring (DCA) order builder.
 *
 * API: https://api.jup.ag/recurring/v1
 *
 * Supports time-based recurring orders:
 *   "invest $50 in SOL every week"
 *   "buy 10 USDC of BONK every day"
 *
 * Flow: createOrder → frontend signs → monitor via getOrders → cancelOrder
 * Fee: 0.1% taken by Jupiter on execution (no upfront fee).
 *
 * Returns serialized base64 transactions for the Homie app to sign with Privy.
 */

const { loadTokenRegistry, getToken } = require("../data/tokenRegistry");

const JUP_RECURRING_BASE = "https://api.jup.ag/recurring/v1";
const JUP_API_KEY = process.env.JUP_API_KEY || "";

const SOL_MINT  = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function jupHeaders() {
  const h = { "Content-Type": "application/json", Accept: "application/json" };
  if (JUP_API_KEY) h["Authorization"] = `Bearer ${JUP_API_KEY}`;
  return h;
}

// ─── Interval helpers ─────────────────────────────────────────────────────────

const INTERVAL_MAP = {
  minute:  60,
  hour:    3_600,
  day:     86_400,
  daily:   86_400,
  week:    604_800,
  weekly:  604_800,
  month:   2_592_000,
  monthly: 2_592_000,
};

function parseInterval(intervalStr) {
  if (typeof intervalStr === "number") return intervalStr;
  const lower = String(intervalStr).toLowerCase().trim();
  return INTERVAL_MAP[lower] ?? INTERVAL_MAP.day;
}

function humanInterval(secs) {
  if (secs >= 2_592_000) return "monthly";
  if (secs >= 604_800)   return "weekly";
  if (secs >= 86_400)    return "daily";
  if (secs >= 3_600)     return "hourly";
  return `every ${secs}s`;
}

async function resolveMint(symbol) {
  if (!symbol) return null;
  const up = symbol.toUpperCase();
  if (up === "SOL") return { mint: SOL_MINT, decimals: 9 };
  if (up === "USDC") return { mint: USDC_MINT, decimals: 6 };
  await loadTokenRegistry();
  const tok = getToken(symbol);
  if (tok) return { mint: tok.address, decimals: tok.decimals ?? 6 };
  if (symbol.length >= 32) return { mint: symbol, decimals: 6 };
  return null;
}

// ─── 1. Create DCA order ─────────────────────────────────────────────────────

async function buildDcaOrderTx({
  inputToken,       // token to spend (usually USDC or SOL)
  outputToken,      // token to accumulate
  amountPerCycle,   // how much inputToken per cycle (human units, e.g. 10 for $10 USDC)
  intervalStr,      // "day", "week", "month", or seconds
  cycles,           // number of cycles (optional — defaults to 52 for weekly, 12 for monthly, 30 for daily)
  walletAddress,
  network = "mainnet",
}) {
  if (network === "devnet") {
    return { error: "Jupiter DCA is mainnet only. Switch to mainnet to set up recurring orders." };
  }

  const inTok  = await resolveMint(inputToken);
  const outTok = await resolveMint(outputToken);
  if (!inTok)  return { error: `Unknown token: ${inputToken}` };
  if (!outTok) return { error: `Unknown token: ${outputToken}` };

  const intervalSecs = parseInterval(intervalStr ?? "week");
  const defaultCycles = intervalSecs >= 2_592_000 ? 12 : intervalSecs >= 604_800 ? 52 : 30;
  const numCycles = Number(cycles) || defaultCycles;

  const inAmountRaw = Math.floor(amountPerCycle * 10 ** inTok.decimals);

  const body = {
    user:        walletAddress,
    inputMint:   inTok.mint,
    outputMint:  outTok.mint,
    params: {
      every: {
        inAmount:           inAmountRaw,
        intervalInSecond:   intervalSecs,
        numberOfOrders:     numCycles,
      },
    },
  };

  const res = await fetch(`${JUP_RECURRING_BASE}/createOrder`, {
    method:  "POST",
    headers: jupHeaders(),
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(12_000),
  });

  if (!res.ok) {
    const err = await res.text();
    return { error: `Jupiter DCA createOrder failed (${res.status}): ${err}` };
  }

  const data = await res.json();
  if (data.error) return { error: `Jupiter DCA: ${data.error}` };

  const serializedTx = data.transaction ?? data.tx ?? data.setupTransaction;
  if (!serializedTx) return { error: "Jupiter DCA returned no transaction" };

  const inSym  = inputToken.toUpperCase();
  const outSym = outputToken.toUpperCase();
  const freq   = humanInterval(intervalSecs);

  return {
    type: "transaction_preview",
    protocol: "Jupiter Recurring (DCA)",
    action: `Buy ${outSym} with ${amountPerCycle} ${inSym} ${freq}`,
    serializedTx,
    estimatedOutput: `${numCycles} orders × ${amountPerCycle} ${inSym} = ${(numCycles * amountPerCycle).toFixed(2)} ${inSym} total`,
    fee: "0.1% per execution (charged by Jupiter on fill)",
    requiresApproval: true,
    orderAddress: data.order?.publicKey ?? data.orderAccount ?? null,
    summary: {
      inputToken: inSym,
      outputToken: outSym,
      amountPerCycle,
      intervalSecs,
      cycles: numCycles,
      totalInput: numCycles * amountPerCycle,
    },
  };
}

// ─── 2. List active DCA orders ────────────────────────────────────────────────

async function getDcaOrders(walletAddress) {
  const url = new URL(`${JUP_RECURRING_BASE}/getRecurringOrders`);
  url.searchParams.set("user", walletAddress);
  url.searchParams.set("orderType", "active");

  const res = await fetch(url.toString(), {
    headers: jupHeaders(),
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) {
    const err = await res.text();
    return { error: `Jupiter DCA getOrders failed: ${err}`, orders: [] };
  }

  const data = await res.json();
  const orders = (data.orders ?? data.recurringOrders ?? data ?? []).map((o) => ({
    address:         o.publicKey ?? o.orderAddress,
    inputMint:       o.inputMint,
    outputMint:      o.outputMint,
    amountPerCycle:  o.cycleAmout ?? o.inAmount,
    intervalSecs:    o.intervalInSecond ?? o.cycleFrequency,
    cyclesCompleted: o.ordersFilledCount ?? o.numberOfOrdersFilled ?? 0,
    cyclesTotal:     o.numberOfOrders,
    createdAt:       o.createdAt,
    status:          o.status ?? "active",
  }));

  return { count: orders.length, orders };
}

// ─── 3. Cancel DCA order ─────────────────────────────────────────────────────

async function cancelDcaOrderTx(orderAddress, walletAddress) {
  const body = {
    user:         walletAddress,
    orderAddress: orderAddress,
  };

  const res = await fetch(`${JUP_RECURRING_BASE}/cancelOrder`, {
    method:  "POST",
    headers: jupHeaders(),
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(12_000),
  });

  if (!res.ok) {
    const err = await res.text();
    return { error: `Jupiter DCA cancelOrder failed: ${err}` };
  }

  const data = await res.json();
  const serializedTx = data.transaction ?? data.tx;
  if (!serializedTx) return { error: "Jupiter DCA cancel returned no transaction" };

  return {
    type: "transaction_preview",
    protocol: "Jupiter Recurring (DCA)",
    action: "Cancel recurring order",
    serializedTx,
    estimatedOutput: "Remaining unspent input tokens returned to your wallet",
    fee: "~0.000005 SOL",
    requiresApproval: true,
  };
}

module.exports = { buildDcaOrderTx, getDcaOrders, cancelDcaOrderTx };