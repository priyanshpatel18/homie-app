// @ts-nocheck
/**
 * raydiumBuilder.js — Raydium CPMM (Standard AMM) transaction builder.
 *
 * Supports:
 *   1. fetchRaydiumPools       — discover pools for a token pair (REST API)
 *   2. buildRaydiumAddLpTx     — add liquidity to a CPMM pool
 *   3. buildRaydiumRemoveLpTx  — remove liquidity from a CPMM pool
 *   4. fetchRaydiumPositions   — user's open LP positions
 *
 * Uses @raydium-io/raydium-sdk-v2.
 * Returns base64 unsigned VersionedTransaction for client signing via Privy.
 */

const { Raydium, TxVersion } = require("@raydium-io/raydium-sdk-v2");
const { Connection, PublicKey } = require("@solana/web3.js");
const BN = require("bn.js");

const RAYDIUM_API = "https://api-v3.raydium.io";

const RPC_URLS = {
  mainnet: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
  devnet:  "https://api.devnet.solana.com",
};

const SOL_MINT  = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";

const KNOWN_MINTS = {
  SOL:  SOL_MINT,
  USDC: USDC_MINT,
  USDT: USDT_MINT,
};

const TOKEN_DECIMALS = {
  [SOL_MINT]:  9,
  [USDC_MINT]: 6,
  [USDT_MINT]: 6,
};

function resolveMint(token) {
  if (!token) return null;
  const upper = token.toUpperCase();
  if (KNOWN_MINTS[upper]) return KNOWN_MINTS[upper];
  // Assume raw mint address
  if (token.length >= 32 && token.length <= 44) return token;
  return null;
}

function getDecimals(mint) {
  return TOKEN_DECIMALS[mint] ?? 6;
}

async function loadRaydium(walletAddress, network = "mainnet") {
  const connection = new Connection(RPC_URLS[network] || RPC_URLS.mainnet, "confirmed");
  return Raydium.load({
    connection,
    owner:            new PublicKey(walletAddress),
    disableLoadToken: true,   // skip token list loading — faster init
  });
}

// ─── 1. Pool discovery via Raydium REST API ───────────────────────────────────

async function fetchRaydiumPools(tokenA, tokenB) {
  const mint1 = resolveMint(tokenA);
  const mint2 = resolveMint(tokenB);
  if (!mint1 || !mint2) {
    throw new Error(`Could not resolve mints for ${tokenA} / ${tokenB}`);
  }

  const url = `${RAYDIUM_API}/pools/info/mint?mint1=${mint1}&mint2=${mint2}&poolType=all&poolSortField=default&sortType=desc&pageSize=5&page=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(7_000) });
  if (!res.ok) throw new Error(`Raydium API error ${res.status}`);
  const json = await res.json();
  const pools = json?.data?.data || [];

  return pools.map((p) => ({
    id:       p.id,
    type:     p.type,                  // "Standard" or "Concentrated"
    tokenA:   p.mintA?.symbol ?? tokenA,
    tokenB:   p.mintB?.symbol ?? tokenB,
    tvlUsd:   p.tvl ?? 0,
    apr24h:   p.day?.apr ?? 0,
    apr7d:    p.week?.apr ?? 0,
    apr30d:   p.month?.apr ?? 0,
    feeRate:  p.feeRate ?? 0,
    price:    p.price ?? 0,
  }));
}

// ─── 2. Add liquidity (CPMM) ─────────────────────────────────────────────────

async function buildRaydiumAddLpTx({ tokenA, tokenB, amountA, walletAddress, network = "mainnet" }) {
  const mint1 = resolveMint(tokenA);
  const mint2 = resolveMint(tokenB);
  if (!mint1 || !mint2) throw new Error(`Cannot resolve mints: ${tokenA} / ${tokenB}`);

  const raydium = await loadRaydium(walletAddress, network);

  // Find the best CPMM pool for this pair
  const poolRes = await raydium.api.fetchPoolByMints({ mint1, mint2, type: "Standard" });
  const pools   = poolRes?.data ?? [];
  if (!pools.length) {
    throw new Error(
      `No Raydium CPMM pool found for ${tokenA.toUpperCase()}-${tokenB.toUpperCase()}. ` +
      `The pair may only exist on Orca or Meteora.`
    );
  }

  // Pick highest-TVL pool
  const poolMeta = pools.sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0))[0];
  const poolInfo = await raydium.cpmm.getPoolInfoFromRpc(poolMeta.id);

  const decimals = getDecimals(mint1);
  const amountBN = new BN(Math.round(amountA * Math.pow(10, decimals)));

  const buildResult = await raydium.cpmm.addLiquidity({
    poolInfo,
    inputAmount:         amountBN,
    baseIn:              true,       // amountA is the "base" token
    slippage:            0.01,       // 1% slippage tolerance
    txVersion:           TxVersion.V0,
    computeBudgetConfig: { microLamports: 80_000 },
  });

  const vt = buildResult.transactions[0];
  const serializedTx = Buffer.from(vt.serialize()).toString("base64");

  const label = `${tokenA.toUpperCase()}-${tokenB.toUpperCase()}`;
  return {
    serializedTx,
    poolId:          poolMeta.id,
    tokenA:          tokenA.toUpperCase(),
    tokenB:          tokenB.toUpperCase(),
    depositedA:      amountA,
    estimatedOutput: `LP tokens for ${label} Raydium CPMM pool`,
    fee:             `${((poolMeta.feeRate ?? 0.0025) * 100).toFixed(2)}% pool fee`,
    protocol:        "Raydium CPMM",
    requiresApproval: true,
    note:            `Deposit into ${label} pool (TVL $${Math.round(poolMeta.tvl ?? 0).toLocaleString()}). You'll receive LP tokens representing your share.`,
  };
}

// ─── 3. Remove liquidity (CPMM) ──────────────────────────────────────────────

async function buildRaydiumRemoveLpTx({ poolId, lpAmount, walletAddress, network = "mainnet" }) {
  if (!poolId) throw new Error("poolId is required — call raydium_get_positions to find it.");

  const raydium  = await loadRaydium(walletAddress, network);
  const poolInfo = await raydium.cpmm.getPoolInfoFromRpc(poolId);

  // lpAmount in LP token units (6 decimals)
  const lpBN = new BN(Math.round(lpAmount * 1e6));

  const buildResult = await raydium.cpmm.removeLiquidity({
    poolInfo,
    lpAmount:            lpBN,
    slippage:            0.01,
    txVersion:           TxVersion.V0,
    computeBudgetConfig: { microLamports: 80_000 },
  });

  const vt = buildResult.transactions[0];
  const serializedTx = Buffer.from(vt.serialize()).toString("base64");

  return {
    serializedTx,
    poolId,
    estimatedOutput: "Both tokens returned to your wallet proportional to your LP share",
    fee:             "~0.000005 SOL network fee",
    protocol:        "Raydium CPMM",
    requiresApproval: true,
  };
}

// ─── 4. Fetch user LP positions ───────────────────────────────────────────────

async function fetchRaydiumPositions(walletAddress) {
  try {
    const res = await fetch(
      `${RAYDIUM_API}/portfolio/positions?wallet=${walletAddress}`,
      { signal: AbortSignal.timeout(7_000) }
    );
    if (!res.ok) return [];
    const json = await res.json();
    const positions = json?.data?.data ?? json?.data ?? [];
    return positions.map((p) => ({
      poolId:  p.poolId ?? p.id,
      tokenA:  p.mintA?.symbol ?? "?",
      tokenB:  p.mintB?.symbol ?? "?",
      lpValue: p.lpAmount ?? 0,
      tvlUsd:  p.tvl ?? null,
    }));
  } catch (err) {
    console.warn("[raydiumBuilder] fetchPositions error:", err.message);
    return [];
  }
}

module.exports = {
  fetchRaydiumPools,
  buildRaydiumAddLpTx,
  buildRaydiumRemoveLpTx,
  fetchRaydiumPositions,
};