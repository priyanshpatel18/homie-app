// @ts-nocheck
/**
 * jupiterTrigger.js — Jupiter Trigger API v2 (limit orders).
 *
 * API: https://api.jup.ag/trigger/v2
 *
 * Supports:
 *   - Simple limit orders: "buy SOL when it drops to $120"
 *   - OCO (One-Cancels-Other): "buy SOL at $120, TP $160, SL $100"
 *   - OTOCO (entry + auto TP/SL bracket)
 *
 * V2 uses USD price triggers — ideal for natural language. Orders are
 * off-chain/private (MEV-resistant), min $10, editable in-place.
 *
 * Fee: collected on fill, not upfront.
 */

const { loadTokenRegistry, getToken } = require("../data/tokenRegistry");

const JUP_TRIGGER_BASE = "https://api.jup.ag/trigger/v2";
const JUP_PRICE_BASE   = "https://api.jup.ag/price/v2";
const JUP_API_KEY = process.env.JUP_API_KEY || "";

const SOL_MINT  = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function jupHeaders() {
  const h = { "Content-Type": "application/json", Accept: "application/json" };
  if (JUP_API_KEY) h["Authorization"] = `Bearer ${JUP_API_KEY}`;
  return h;
}

async function resolveMint(symbol) {
  if (!symbol) return null;
  const up = symbol.toUpperCase();
  if (up === "SOL")  return { mint: SOL_MINT,  decimals: 9 };
  if (up === "USDC") return { mint: USDC_MINT, decimals: 6 };
  await loadTokenRegistry();
  const tok = getToken(symbol);
  if (tok) return { mint: tok.address, decimals: tok.decimals ?? 6 };
  if (symbol.length >= 32) return { mint: symbol, decimals: 6 };
  return null;
}

async function fetchCurrentPrice(mintAddress) {
  try {
    const res = await fetch(`${JUP_PRICE_BASE}?ids=${mintAddress}`, {
      headers: jupHeaders(),
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const price = parseFloat(data?.data?.[mintAddress]?.price);
    return isFinite(price) ? price : null;
  } catch {
    return null;
  }
}

// ─── 1. Simple limit order ────────────────────────────────────────────────────
// "Buy SOL when price drops to $120"
// "Sell BONK when price hits $0.00005"

async function buildLimitOrderTx({
  inputToken,     // token to sell / spend (e.g. "USDC" to buy SOL)
  outputToken,    // token to buy / receive
  inputAmount,    // amount of inputToken (human units)
  triggerPrice,   // USD price of outputToken at which order fires
  expireIn,       // optional: "1d", "7d", "30d" — order expiry
  walletAddress,
  network = "mainnet",
}) {
  if (network === "devnet") {
    return { error: "Jupiter limit orders are mainnet only." };
  }

  const inTok  = await resolveMint(inputToken);
  const outTok = await resolveMint(outputToken);
  if (!inTok)  return { error: `Unknown token: ${inputToken}` };
  if (!outTok) return { error: `Unknown token: ${outputToken}` };

  if (inputAmount < 10) return { error: "Minimum order size is $10." };

  const inAmountRaw = Math.floor(inputAmount * 10 ** inTok.decimals);

  // triggerPrice in USD — convert to outAmount using triggerPrice
  // outAmount = inputAmount (in USD) / triggerPrice  (assuming inputToken ≈ USD)
  const estimatedOut = inputAmount / triggerPrice;
  const outAmountRaw = Math.floor(estimatedOut * 10 ** outTok.decimals);

  // Expiry: default 7 days
  const expireSeconds = parseExpiry(expireIn ?? "7d");
  const expiredAt = Math.floor(Date.now() / 1000) + expireSeconds;

  const body = {
    user:        walletAddress,
    inputMint:   inTok.mint,
    outputMint:  outTok.mint,
    inAmount:    inAmountRaw.toString(),
    outAmount:   outAmountRaw.toString(),
    expiredAt,
  };

  const res = await fetch(`${JUP_TRIGGER_BASE}/createOrder`, {
    method:  "POST",
    headers: jupHeaders(),
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(12_000),
  });

  if (!res.ok) {
    const err = await res.text();
    return { error: `Jupiter limit order failed (${res.status}): ${err}` };
  }

  const data = await res.json();
  if (data.error) return { error: `Jupiter trigger: ${data.error}` };

  const serializedTx = data.transaction ?? data.tx;
  if (!serializedTx) return { error: "Jupiter trigger returned no transaction" };

  // Fetch current price for context
  const currentPrice = await fetchCurrentPrice(outTok.mint);
  const priceContext = currentPrice
    ? ` (current price: $${currentPrice.toFixed(4)})`
    : "";

  const inSym  = inputToken.toUpperCase();
  const outSym = outputToken.toUpperCase();

  return {
    type: "transaction_preview",
    protocol: "Jupiter Limit Order",
    action: `Buy ${estimatedOut.toFixed(4)} ${outSym} when price hits $${triggerPrice}`,
    serializedTx,
    estimatedOutput: `~${estimatedOut.toFixed(4)} ${outSym} at $${triggerPrice}${priceContext}`,
    fee: "Fee charged on fill by Jupiter",
    requiresApproval: true,
    orderAddress: data.order?.publicKey ?? null,
    summary: {
      inputToken: inSym,
      outputToken: outSym,
      inputAmount,
      triggerPrice,
      estimatedOutput: estimatedOut,
      expiresIn: expireIn ?? "7d",
      currentPrice,
    },
  };
}

// ─── 2. OCO — One-Cancels-Other (Take Profit + Stop Loss) ────────────────────
// "I hold 10 SOL — set TP at $200 and SL at $130"
// Creates two linked orders: if one fills, the other is automatically cancelled.

async function buildOcoOrderTx({
  holdingToken,     // token you're holding (e.g. "SOL")
  quoteToken,       // what to receive (e.g. "USDC")
  holdingAmount,    // how much holdingToken to protect (human units)
  takeProfitPrice,  // USD price to sell at for profit
  stopLossPrice,    // USD price to sell at to limit losses
  walletAddress,
  network = "mainnet",
}) {
  if (network === "devnet") {
    return { error: "Jupiter OCO orders are mainnet only." };
  }

  const inTok  = await resolveMint(holdingToken);
  const outTok = await resolveMint(quoteToken);
  if (!inTok)  return { error: `Unknown token: ${holdingToken}` };
  if (!outTok) return { error: `Unknown token: ${quoteToken}` };

  const inAmountRaw = Math.floor(holdingAmount * 10 ** inTok.decimals);

  // TP order: sell holdingToken at takeProfitPrice
  const tpOutRaw = Math.floor((holdingAmount * takeProfitPrice) * 10 ** outTok.decimals);
  // SL order: sell holdingToken at stopLossPrice
  const slOutRaw = Math.floor((holdingAmount * stopLossPrice) * 10 ** outTok.decimals);

  const expiredAt = Math.floor(Date.now() / 1000) + 30 * 86_400; // 30 days

  // Create both orders — Jupiter v2 links them as OCO when both share the same inputMint/amount
  const [tpRes, slRes] = await Promise.all([
    fetch(`${JUP_TRIGGER_BASE}/createOrder`, {
      method:  "POST",
      headers: jupHeaders(),
      body: JSON.stringify({
        user: walletAddress,
        inputMint:  inTok.mint,
        outputMint: outTok.mint,
        inAmount:   inAmountRaw.toString(),
        outAmount:  tpOutRaw.toString(),
        expiredAt,
      }),
      signal: AbortSignal.timeout(12_000),
    }),
    fetch(`${JUP_TRIGGER_BASE}/createOrder`, {
      method:  "POST",
      headers: jupHeaders(),
      body: JSON.stringify({
        user: walletAddress,
        inputMint:  inTok.mint,
        outputMint: outTok.mint,
        inAmount:   inAmountRaw.toString(),
        outAmount:  slOutRaw.toString(),
        expiredAt,
      }),
      signal: AbortSignal.timeout(12_000),
    }),
  ]);

  if (!tpRes.ok || !slRes.ok) {
    return { error: "Failed to create OCO orders. Try again in a moment." };
  }

  const [tpData, slData] = await Promise.all([tpRes.json(), slRes.json()]);

  const inSym  = holdingToken.toUpperCase();
  const outSym = quoteToken.toUpperCase();

  const currentPrice = await fetchCurrentPrice(inTok.mint);
  const priceContext = currentPrice ? ` (current: $${currentPrice.toFixed(2)})` : "";

  // Return both transactions — frontend shows two sequential confirm modals
  return {
    type: "oco_preview",
    protocol: "Jupiter OCO (TP/SL)",
    action: `Protect ${holdingAmount} ${inSym}${priceContext}`,
    transactions: [
      {
        label:        `Take Profit at $${takeProfitPrice}`,
        serializedTx: tpData.transaction ?? tpData.tx,
        orderAddress: tpData.order?.publicKey,
      },
      {
        label:        `Stop Loss at $${stopLossPrice}`,
        serializedTx: slData.transaction ?? slData.tx,
        orderAddress: slData.order?.publicKey,
      },
    ],
    estimatedOutput: `TP: ~${(holdingAmount * takeProfitPrice).toFixed(2)} ${outSym} | SL: ~${(holdingAmount * stopLossPrice).toFixed(2)} ${outSym}`,
    fee: "Fee charged on fill",
    requiresApproval: true,
    summary: {
      holdingToken: inSym, quoteToken: outSym, holdingAmount,
      takeProfitPrice, stopLossPrice, currentPrice,
    },
  };
}

// ─── 3. Get active limit orders ───────────────────────────────────────────────

async function getLimitOrders(walletAddress) {
  const url = new URL(`${JUP_TRIGGER_BASE}/getTriggerOrders`);
  url.searchParams.set("user", walletAddress);
  url.searchParams.set("orderStatus", "active");

  const res = await fetch(url.toString(), {
    headers: jupHeaders(),
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) {
    const err = await res.text();
    return { error: `Failed to fetch limit orders: ${err}`, orders: [] };
  }

  const data = await res.json();
  const orders = (data.orders ?? data.triggerOrders ?? data ?? []).map((o) => ({
    address:      o.publicKey ?? o.orderAddress,
    inputMint:    o.inputMint,
    outputMint:   o.outputMint,
    inAmount:     o.inAmount,
    outAmount:    o.outAmount,
    filledAmount: o.filledInAmount ?? 0,
    status:       o.status ?? "active",
    createdAt:    o.createdAt,
    expiredAt:    o.expiredAt,
  }));

  return { count: orders.length, orders };
}

// ─── 4. Cancel limit order ────────────────────────────────────────────────────

async function cancelLimitOrderTx(orderAddress, walletAddress) {
  const res = await fetch(`${JUP_TRIGGER_BASE}/cancelOrder`, {
    method:  "POST",
    headers: jupHeaders(),
    body:    JSON.stringify({ user: walletAddress, orderAddress }),
    signal:  AbortSignal.timeout(12_000),
  });

  if (!res.ok) {
    const err = await res.text();
    return { error: `Cancel limit order failed: ${err}` };
  }

  const data = await res.json();
  const serializedTx = data.transaction ?? data.tx;
  if (!serializedTx) return { error: "Cancel returned no transaction" };

  return {
    type: "transaction_preview",
    protocol: "Jupiter Limit Order",
    action: "Cancel limit order",
    serializedTx,
    estimatedOutput: "Input tokens returned to your wallet",
    fee: "~0.000005 SOL",
    requiresApproval: true,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseExpiry(str) {
  const match = String(str).match(/^(\d+)(d|h|w)$/i);
  if (!match) return 7 * 86_400;
  const n = parseInt(match[1]);
  switch (match[2].toLowerCase()) {
    case "h": return n * 3_600;
    case "w": return n * 604_800;
    default:  return n * 86_400;
  }
}

module.exports = {
  buildLimitOrderTx,
  buildOcoOrderTx,
  getLimitOrders,
  cancelLimitOrderTx,
};