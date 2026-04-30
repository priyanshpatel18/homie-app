// @ts-nocheck
/**
 * Jito Builder — constructs Solana transactions for:
 * 1. Jito Liquid Staking   (SOL → jitoSOL via SPL Stake Pool)
 * 2. Jito Liquid Unstaking  (jitoSOL → SOL via SPL Stake Pool)
 * 3. Jito MEV Bundle Submit (send transactions via Jito Block Engine for better landing)
 *
 * Uses @solana/spl-stake-pool for stake pool interactions.
 * Uses jito-ts for MEV bundle submission to Jito's Block Engine.
 *
 * Returns serialized base64 transactions for the app to deserialize,
 * show a preview, and sign with the Privy embedded wallet.
 */

const {
  Connection,
  PublicKey,
  Transaction,
  LAMPORTS_PER_SOL,
  SystemProgram,
} = require("@solana/web3.js");

const {
  depositSol,
  withdrawSol,
  stakePoolInfo,
} = require("@solana/spl-stake-pool");

const {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} = require("@solana/spl-token");

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

// ─── Jito Mainnet Constants ──────────────────────────────────────────────────

const JITO_STAKE_POOL = new PublicKey("Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb");
const JITOSOL_MINT    = new PublicKey("J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn");

// Jito Block Engine endpoints (mainnet)
const JITO_BLOCK_ENGINE_URL = process.env.JITO_BLOCK_ENGINE_URL
  || "https://mainnet.block-engine.jito.wtf";

// Jito tip accounts — one is randomly selected per bundle to pay the MEV tip
const JITO_TIP_ACCOUNTS = [
  "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
  "HFqU5x63VTqvQss8hp11i4bVqkfRtQ7NmXwkidjFjFha",
  "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
  "ADaUMid9yfUC5Dkn3w1cE4rVwEQniZSGjS5Ns1YBQDPsp",
  "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  "ADuUkR4vqLUMWXxW9gh6D6L8pMSGA6uM1MczBJPu3LvFn",
  "DttWaMuVvTiDuNaKg692mPVCpFDQ1sQQMBcoEBQm5vp7T",
  "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
];


// ─── 1. Jito Liquid Staking (SOL → jitoSOL) ─────────────────────────────────
//
// Deposits SOL into the Jito SPL Stake Pool and receives jitoSOL — a liquid
// staking token that appreciates vs SOL as MEV + staking rewards accrue.
// jitoSOL earns higher APY than vanilla staking because Jito validators
// share MEV tips with stakers.

async function buildJitoStakeTx(amountSol, walletAddress, network = "mainnet") {
  if (network === "devnet") {
    return { error: "Jito staking is mainnet-only. Switch to mainnet to stake SOL → jitoSOL." };
  }
  if (amountSol <= 0) return { error: "Amount must be greater than 0" };
  if (amountSol < 0.01) return { error: "Minimum stake is 0.01 SOL" };

  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const walletPubkey = new PublicKey(walletAddress);
    const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);

    // Build deposit instructions via SPL Stake Pool SDK
    const { instructions, signers } = await depositSol(
      connection,
      JITO_STAKE_POOL,
      walletPubkey,
      lamports,
    );

    // Build legacy transaction
    const tx = new Transaction().add(...instructions);
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = walletPubkey;

    // Sign with any auxiliary signers (e.g. ephemeral keypairs for ATA creation)
    if (signers.length > 0) {
      tx.partialSign(...signers);
    }

    const serializedTx = tx
      .serialize({ requireAllSignatures: false })
      .toString("base64");

    // Estimate jitoSOL output (pool rate is ~1:1 with small premium)
    let estimatedJitoSol = amountSol;
    try {
      const poolInfo = await stakePoolInfo(connection, JITO_STAKE_POOL);
      if (poolInfo.totalLamports > 0 && poolInfo.poolTokenSupply > 0) {
        const rate = Number(poolInfo.totalLamports) / Number(poolInfo.poolTokenSupply);
        estimatedJitoSol = amountSol / rate;
      }
    } catch { /* use 1:1 estimate */ }

    return {
      type: "transaction_preview",
      protocol: "Jito Liquid Staking",
      action: `Liquid stake ${amountSol} SOL → jitoSOL`,
      serializedTx,
      estimatedOutput: `~${estimatedJitoSol.toFixed(4)} jitoSOL`,
      fee: "~0.000005 SOL (network fee)",
      why: "You receive jitoSOL — a liquid staking token that earns staking yield + MEV tips (~7–8% APY). Jito validators share MEV revenue with stakers, giving higher returns than vanilla staking. No lockup: trade it, use as collateral, or swap back anytime.",
      requiresApproval: true,
    };
  } catch (err) {
    console.error("[Jito Stake] error:", err.message);
    return { error: `Jito staking failed: ${err.message}` };
  }
}


// ─── 2. Jito Liquid Unstaking (jitoSOL → SOL) ───────────────────────────────
//
// Withdraws jitoSOL back to SOL via the Jito SPL Stake Pool.
// Uses withdrawSol for instant redemption from the pool's reserve.
// If the pool reserve is low, may need to use delayed unstake (epoch boundary).

async function buildJitoUnstakeTx(amountJitoSol, walletAddress, network = "mainnet") {
  if (network === "devnet") {
    return { error: "Jito unstaking is mainnet-only. Switch to mainnet." };
  }
  if (amountJitoSol <= 0) return { error: "Amount must be greater than 0" };

  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const walletPubkey = new PublicKey(walletAddress);

    // jitoSOL has 9 decimals (same as SOL)
    const poolTokenAmount = Math.floor(amountJitoSol * LAMPORTS_PER_SOL);

    // Get user's jitoSOL ATA
    const jitoSolAta = await getAssociatedTokenAddress(
      JITOSOL_MINT,
      walletPubkey,
    );

    // Build withdraw instructions
    const { instructions, signers } = await withdrawSol(
      connection,
      JITO_STAKE_POOL,
      walletPubkey,
      jitoSolAta,
      poolTokenAmount,
    );

    const tx = new Transaction().add(...instructions);
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = walletPubkey;

    if (signers.length > 0) {
      tx.partialSign(...signers);
    }

    const serializedTx = tx
      .serialize({ requireAllSignatures: false })
      .toString("base64");

    // Estimate SOL output (jitoSOL trades at a premium to SOL)
    let estimatedSol = amountJitoSol;
    try {
      const poolInfo = await stakePoolInfo(connection, JITO_STAKE_POOL);
      if (poolInfo.totalLamports > 0 && poolInfo.poolTokenSupply > 0) {
        const rate = Number(poolInfo.totalLamports) / Number(poolInfo.poolTokenSupply);
        estimatedSol = amountJitoSol * rate;
      }
    } catch { /* use 1:1 estimate */ }

    // Pool withdrawal fee is typically 0.1% on Jito
    const feeEstimate = (estimatedSol * 0.001).toFixed(4);

    return {
      type: "transaction_preview",
      protocol: "Jito Liquid Unstake",
      action: `Unstake ${amountJitoSol} jitoSOL → SOL`,
      serializedTx,
      estimatedOutput: `~${(estimatedSol * 0.999).toFixed(4)} SOL (after ~0.1% fee)`,
      fee: `~${feeEstimate} SOL withdrawal fee + network fees`,
      why: "Instant liquid unstake via Jito's stake pool reserve. A small withdrawal fee (~0.1%) applies. Alternatively, you can swap jitoSOL → SOL on Jupiter for potentially better rates.",
      requiresApproval: true,
    };
  } catch (err) {
    console.error("[Jito Unstake] error:", err.message);
    return { error: `Jito unstake failed: ${err.message}` };
  }
}


// ─── 3. Jito MEV Bundle Submission ───────────────────────────────────────────
//
// Sends a signed transaction through Jito's Block Engine for priority landing.
// Adds a tip to a Jito tip account to incentivize validators to include the tx.
// This is used for time-sensitive transactions (swaps, liquidations, arb).

async function buildJitoTipInstruction(walletAddress, tipLamports = 10000) {
  const walletPubkey = new PublicKey(walletAddress);

  // Pick a random tip account
  const tipAccount = new PublicKey(
    JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]
  );

  return SystemProgram.transfer({
    fromPubkey: walletPubkey,
    toPubkey: tipAccount,
    lamports: tipLamports,
  });
}

/**
 * Submit a serialized transaction as a Jito bundle for MEV-protected landing.
 * The transaction should already be signed by the user.
 *
 * @param {string} serializedTx — base64 encoded signed transaction
 * @param {number} tipLamports — tip amount in lamports (default 10000 = 0.00001 SOL)
 * @returns {{ bundleId: string } | { error: string }}
 */
async function submitJitoBundle(serializedTx, tipLamports = 10000) {
  try {
    // Send as a single-transaction bundle via Jito JSON-RPC
    const response = await fetch(`${JITO_BLOCK_ENGINE_URL}/api/v1/bundles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "sendBundle",
        params: [[serializedTx]],
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { error: `Jito bundle submission failed: ${errText}` };
    }

    const data = await response.json();
    if (data.error) {
      return { error: `Jito bundle error: ${data.error.message || JSON.stringify(data.error)}` };
    }

    return {
      bundleId: data.result,
      status: "submitted",
      message: "Transaction submitted via Jito Block Engine for priority landing.",
    };
  } catch (err) {
    console.error("[Jito Bundle] error:", err.message);
    return { error: `Jito bundle failed: ${err.message}` };
  }
}

/**
 * Check the status of a submitted Jito bundle.
 *
 * @param {string} bundleId
 * @returns {object} bundle status
 */
async function getJitoBundleStatus(bundleId) {
  try {
    const response = await fetch(`${JITO_BLOCK_ENGINE_URL}/api/v1/bundles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getBundleStatuses",
        params: [[bundleId]],
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return { error: "Failed to check bundle status" };
    }

    const data = await response.json();
    if (data.error) {
      return { error: data.error.message };
    }

    const statuses = data.result?.value ?? [];
    const status = statuses.find((s) => s.bundle_id === bundleId);

    return status
      ? { bundleId, status: status.confirmation_status, slot: status.slot }
      : { bundleId, status: "not_found" };
  } catch (err) {
    return { error: `Bundle status check failed: ${err.message}` };
  }
}


module.exports = {
  buildJitoStakeTx,
  buildJitoUnstakeTx,
  buildJitoTipInstruction,
  submitJitoBundle,
  getJitoBundleStatus,
  JITO_STAKE_POOL,
  JITOSOL_MINT,
  JITO_TIP_ACCOUNTS,
};