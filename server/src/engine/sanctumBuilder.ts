// @ts-nocheck
/**
 * Sanctum Builder — constructs Solana transactions for:
 * 1. Sanctum INF Staking     (SOL → INF via Sanctum Infinity Pool)
 * 2. Sanctum INF Unstaking   (INF → SOL)
 * 3. Sanctum LST Swap        (any LST → any LST via Sanctum Router)
 *
 * Uses Sanctum's REST API hosted at sanctum-s-api.fly.dev for swap quotes
 * and transaction building. The API returns serialized transactions that
 * the client signs and broadcasts.
 *
 * Sanctum's Infinity Pool (INF) is a multi-LST liquidity pool that spreads
 * delegation across all integrated validators, earning diversified staking
 * yield with zero concentration risk.
 */

const {
  Connection,
  PublicKey,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} = require("@solana/web3.js");

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

// ─── Sanctum Constants ───────────────────────────────────────────────────────

// Sanctum API — Ironforge-hosted (requires API key for production)
const SANCTUM_API_BASE = process.env.SANCTUM_API_URL
  || "https://sanctum-s-api.fly.dev/v1";

const SANCTUM_API_KEY = process.env.SANCTUM_API_KEY || "";

// Well-known mints
const SOL_MINT  = "So11111111111111111111111111111111111111112";
const INF_MINT  = "5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm";

// Common LST mints for quick resolution
const LST_MINTS = {
  SOL:     SOL_MINT,
  INF:     INF_MINT,
  JITOSOL: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
  MSOL:    "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
  BSOL:    "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1",
  JISOL:   "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
  HSOL:    "he1iusmfkpAdwvxLNGV8Y1iSbj4rUy6yMhEA3fotn9A",
  COGENTSOL: "CgntPoLka5pD5fesJYhGmUCF8KU1QS1ZmZiuAuMZr2az",
};

function sanctumHeaders() {
  const h = {
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
  if (SANCTUM_API_KEY) h["Authorization"] = `Bearer ${SANCTUM_API_KEY}`;
  return h;
}

/**
 * Resolve a token symbol or mint to its mint address.
 * Falls back to treating input as a raw mint address.
 */
function resolveMint(tokenInput) {
  const upper = (tokenInput || "").toUpperCase().replace(/[-_\s]/g, "");
  return LST_MINTS[upper] || tokenInput;
}


// ─── 1. Sanctum INF Staking (SOL → INF) ─────────────────────────────────────
//
// Stakes SOL into Sanctum's Infinity Pool and receives INF — a diversified
// LST that spreads across 100+ validators. INF earns blended staking yield
// from all integrated LSTs. No lockup, instantly liquid.

async function buildSanctumStakeInfTx(amountSol, walletAddress, network = "mainnet") {
  if (network === "devnet") {
    return { error: "Sanctum INF staking is mainnet-only." };
  }
  if (amountSol <= 0) return { error: "Amount must be greater than 0" };
  if (amountSol < 0.01) return { error: "Minimum stake is 0.01 SOL" };

  try {
    const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);

    // Step 1: Get swap quote (SOL → INF)
    const quoteUrl = new URL(`${SANCTUM_API_BASE}/swap/quote`);
    quoteUrl.searchParams.set("input", SOL_MINT);
    quoteUrl.searchParams.set("outputLstMint", INF_MINT);
    quoteUrl.searchParams.set("amount", lamports.toString());
    quoteUrl.searchParams.set("mode", "ExactIn");

    const quoteRes = await fetch(quoteUrl.toString(), {
      headers: sanctumHeaders(),
      signal: AbortSignal.timeout(10000),
    });

    if (!quoteRes.ok) {
      const errText = await quoteRes.text();
      // Fallback: route via Jupiter swap if Sanctum API is unavailable
      return { error: `Sanctum quote failed (${quoteRes.status}): ${errText}. Try swapping SOL → INF via Jupiter instead.` };
    }

    const quote = await quoteRes.json();
    const outAmount = quote.outAmount ?? quote.outputAmount ?? quote.amount ?? 0;

    // Step 2: Build the swap transaction
    const swapRes = await fetch(`${SANCTUM_API_BASE}/swap/execute`, {
      method: "POST",
      headers: sanctumHeaders(),
      body: JSON.stringify({
        input: SOL_MINT,
        outputLstMint: INF_MINT,
        amount: lamports.toString(),
        quotedAmount: outAmount.toString(),
        signer: walletAddress,
        mode: "ExactIn",
        slippageBps: 50,
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!swapRes.ok) {
      const errText = await swapRes.text();
      return { error: `Sanctum swap build failed: ${errText}` };
    }

    const swapData = await swapRes.json();
    const serializedTx = swapData.tx ?? swapData.transaction ?? swapData.swapTransaction;

    if (!serializedTx) {
      return { error: "Sanctum returned no transaction data. Try again or swap via Jupiter." };
    }

    // INF has 9 decimals
    const estimatedInf = (Number(outAmount) / LAMPORTS_PER_SOL).toFixed(4);

    return {
      type: "transaction_preview",
      protocol: "Sanctum INF Staking",
      action: `Stake ${amountSol} SOL → INF (Sanctum Infinity)`,
      serializedTx,
      estimatedOutput: `~${estimatedInf} INF`,
      fee: "~0.000005 SOL (network fee)",
      why: "INF is Sanctum's Infinity Pool LST — your SOL is spread across 100+ validators for maximum decentralization. Earns blended staking yield (~7–8% APY) from all integrated LSTs. No lockup, instantly tradeable, and zero single-validator risk.",
      requiresApproval: true,
    };
  } catch (err) {
    console.error("[Sanctum INF Stake] error:", err.message);
    return { error: `Sanctum INF staking failed: ${err.message}` };
  }
}


// ─── 2. Sanctum INF Unstaking (INF → SOL) ───────────────────────────────────

async function buildSanctumUnstakeInfTx(amountInf, walletAddress, network = "mainnet") {
  if (network === "devnet") {
    return { error: "Sanctum unstaking is mainnet-only." };
  }
  if (amountInf <= 0) return { error: "Amount must be greater than 0" };

  try {
    const infLamports = Math.floor(amountInf * LAMPORTS_PER_SOL); // INF has 9 decimals

    // Step 1: Quote INF → SOL
    const quoteUrl = new URL(`${SANCTUM_API_BASE}/swap/quote`);
    quoteUrl.searchParams.set("input", INF_MINT);
    quoteUrl.searchParams.set("outputLstMint", SOL_MINT);
    quoteUrl.searchParams.set("amount", infLamports.toString());
    quoteUrl.searchParams.set("mode", "ExactIn");

    const quoteRes = await fetch(quoteUrl.toString(), {
      headers: sanctumHeaders(),
      signal: AbortSignal.timeout(10000),
    });

    if (!quoteRes.ok) {
      const errText = await quoteRes.text();
      return { error: `Sanctum unstake quote failed: ${errText}. Try swapping INF → SOL on Jupiter.` };
    }

    const quote = await quoteRes.json();
    const outAmount = quote.outAmount ?? quote.outputAmount ?? quote.amount ?? 0;

    // Step 2: Build the swap transaction
    const swapRes = await fetch(`${SANCTUM_API_BASE}/swap/execute`, {
      method: "POST",
      headers: sanctumHeaders(),
      body: JSON.stringify({
        input: INF_MINT,
        outputLstMint: SOL_MINT,
        amount: infLamports.toString(),
        quotedAmount: outAmount.toString(),
        signer: walletAddress,
        mode: "ExactIn",
        slippageBps: 50,
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!swapRes.ok) {
      const errText = await swapRes.text();
      return { error: `Sanctum unstake build failed: ${errText}` };
    }

    const swapData = await swapRes.json();
    const serializedTx = swapData.tx ?? swapData.transaction ?? swapData.swapTransaction;

    if (!serializedTx) {
      return { error: "Sanctum returned no transaction. Try swapping INF → SOL on Jupiter." };
    }

    const estimatedSol = (Number(outAmount) / LAMPORTS_PER_SOL).toFixed(4);

    return {
      type: "transaction_preview",
      protocol: "Sanctum INF Unstake",
      action: `Unstake ${amountInf} INF → SOL`,
      serializedTx,
      estimatedOutput: `~${estimatedSol} SOL`,
      fee: "~0.000005 SOL (network fee) + pool fee",
      why: "Redeems your INF back to SOL via Sanctum's Infinity Pool. Instant — no waiting period. A small pool fee may apply.",
      requiresApproval: true,
    };
  } catch (err) {
    console.error("[Sanctum INF Unstake] error:", err.message);
    return { error: `Sanctum INF unstake failed: ${err.message}` };
  }
}


// ─── 3. Sanctum LST Swap (any LST ↔ any LST) ───────────────────────────────
//
// Swaps between any Sanctum-integrated LSTs (e.g. jitoSOL → mSOL, bSOL → INF).
// Routes through Sanctum's router which uses the Infinity Pool for deep liquidity.
// This often gives better rates than DEX swaps for LST-to-LST pairs.

async function buildSanctumLstSwapTx(inputToken, outputToken, amount, walletAddress, network = "mainnet") {
  if (network === "devnet") {
    return { error: "Sanctum LST swaps are mainnet-only." };
  }
  if (amount <= 0) return { error: "Amount must be greater than 0" };

  const inputMint = resolveMint(inputToken);
  const outputMint = resolveMint(outputToken);

  if (inputMint === outputMint) {
    return { error: "Input and output tokens must be different." };
  }

  const inputSymbol = inputToken.toUpperCase();
  const outputSymbol = outputToken.toUpperCase();

  try {
    // Determine decimals (most LSTs have 9 decimals)
    const decimals = 9;
    const atomicAmount = Math.floor(amount * 10 ** decimals);

    // Step 1: Quote
    const quoteUrl = new URL(`${SANCTUM_API_BASE}/swap/quote`);
    quoteUrl.searchParams.set("input", inputMint);
    quoteUrl.searchParams.set("outputLstMint", outputMint);
    quoteUrl.searchParams.set("amount", atomicAmount.toString());
    quoteUrl.searchParams.set("mode", "ExactIn");

    const quoteRes = await fetch(quoteUrl.toString(), {
      headers: sanctumHeaders(),
      signal: AbortSignal.timeout(10000),
    });

    if (!quoteRes.ok) {
      const errText = await quoteRes.text();
      return { error: `Sanctum LST swap quote failed: ${errText}. Try using Jupiter for this swap.` };
    }

    const quote = await quoteRes.json();
    const outAmount = quote.outAmount ?? quote.outputAmount ?? quote.amount ?? 0;

    // Step 2: Build transaction
    const swapRes = await fetch(`${SANCTUM_API_BASE}/swap/execute`, {
      method: "POST",
      headers: sanctumHeaders(),
      body: JSON.stringify({
        input: inputMint,
        outputLstMint: outputMint,
        amount: atomicAmount.toString(),
        quotedAmount: outAmount.toString(),
        signer: walletAddress,
        mode: "ExactIn",
        slippageBps: 50,
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!swapRes.ok) {
      const errText = await swapRes.text();
      return { error: `Sanctum LST swap build failed: ${errText}` };
    }

    const swapData = await swapRes.json();
    const serializedTx = swapData.tx ?? swapData.transaction ?? swapData.swapTransaction;

    if (!serializedTx) {
      return { error: "Sanctum returned no transaction. Try swapping via Jupiter." };
    }

    const estimatedOut = (Number(outAmount) / 10 ** decimals).toFixed(4);

    return {
      type: "transaction_preview",
      protocol: "Sanctum Router",
      action: `Swap ${amount} ${inputSymbol} → ${outputSymbol} via Sanctum`,
      serializedTx,
      estimatedOutput: `~${estimatedOut} ${outputSymbol}`,
      fee: "~0.000005 SOL (network fee)",
      why: `Sanctum routes LST-to-LST swaps through its Infinity Pool for deep liquidity and minimal slippage. Often better rates than DEX swaps for LST pairs.`,
      requiresApproval: true,
    };
  } catch (err) {
    console.error("[Sanctum LST Swap] error:", err.message);
    return { error: `Sanctum LST swap failed: ${err.message}` };
  }
}


// ─── 4. Fetch Sanctum LST List ───────────────────────────────────────────────
//
// Returns the full list of LSTs integrated with Sanctum, including APY data.

async function fetchSanctumLstList() {
  try {
    const res = await fetch(`${SANCTUM_API_BASE}/lsts`, {
      headers: sanctumHeaders(),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return { error: `Sanctum LST list fetch failed: ${res.status}` };
    }

    const data = await res.json();
    const lsts = Array.isArray(data) ? data : data.lsts ?? data.data ?? [];

    // Return a summarized list
    return {
      count: lsts.length,
      lsts: lsts.slice(0, 50).map((lst) => ({
        symbol: lst.symbol ?? lst.ticker ?? "?",
        name: lst.name ?? lst.label ?? "",
        mint: lst.mint ?? lst.address ?? "",
        apy: lst.apy ?? lst.estimated_apy ?? null,
        tvl: lst.tvl ?? lst.total_value_locked ?? null,
      })),
    };
  } catch (err) {
    console.error("[Sanctum LST List] error:", err.message);
    return { error: `Failed to fetch Sanctum LST list: ${err.message}` };
  }
}


module.exports = {
  buildSanctumStakeInfTx,
  buildSanctumUnstakeInfTx,
  buildSanctumLstSwapTx,
  fetchSanctumLstList,
  INF_MINT,
  SOL_MINT,
  LST_MINTS,
};