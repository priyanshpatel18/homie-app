// @ts-nocheck
/**
 * Jupiter Lend / Earn transaction builder.
 * Uses the Jupiter Lend REST API to build deposit and withdraw transactions.
 * No SDK needed — the API returns instruction sets we assemble into a VersionedTransaction.
 *
 * API Reference: https://dev.jup.ag/docs/lend/earn/api
 */

const {
  Connection,
  PublicKey,
  TransactionMessage,
  TransactionInstruction,
  VersionedTransaction,
} = require("@solana/web3.js");

const { getAssociatedTokenAddressSync, getAccount, TokenAccountNotFoundError } = require("@solana/spl-token");

const JUP_LEND_BASE = "https://api.jup.ag/lend/v1";

const RPC_URLS = {
  mainnet: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
  devnet:  "https://api.devnet.solana.com",
};

// Well-known mints
const MINTS = {
  SOL:  "So11111111111111111111111111111111111111112",
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  MSOL: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
  JITOSOL: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
};

const TOKEN_DECIMALS = {
  SOL: 9, USDC: 6, USDT: 6, MSOL: 9, JITOSOL: 9,
};

function apiHeaders() {
  const h = { "Content-Type": "application/json", Accept: "application/json" };
  if (process.env.JUP_API_KEY) h["x-api-key"] = process.env.JUP_API_KEY;
  return h;
}

function getConnection(network = "mainnet") {
  return new Connection(RPC_URLS[network] ?? RPC_URLS.mainnet, "confirmed");
}

function resolveMint(token) {
  const up = token.toUpperCase().replace(/-/g, "");
  return MINTS[up] ?? token; // if already a mint address, pass through
}

function resolveDecimals(token) {
  const up = token.toUpperCase().replace(/-/g, "");
  return TOKEN_DECIMALS[up] ?? 9;
}

/**
 * Deserialize a Jupiter Lend API instruction into a TransactionInstruction.
 */
function deserializeInstruction(ix) {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map((a) => ({
      pubkey: new PublicKey(a.pubkey),
      isSigner: a.isSigner,
      isWritable: a.isWritable,
    })),
    data: Buffer.from(ix.data, "base64"),
  });
}

/**
 * Build a Jupiter Earn deposit transaction.
 */
async function buildJupiterLendDepositTx(token, amount, walletAddress, network = "mainnet") {
  const tokenUp = token.toUpperCase();
  const mint = resolveMint(token);
  const decimals = resolveDecimals(token);
  const connection = getConnection(network);
  const wallet = new PublicKey(walletAddress);

  // Validate balance for non-SOL tokens
  if (tokenUp !== "SOL") {
    try {
      const ata = getAssociatedTokenAddressSync(new PublicKey(mint), wallet);
      const acct = await getAccount(connection, ata);
      const balance = Number(acct.amount) / Math.pow(10, decimals);
      if (balance < amount) {
        return { error: `Insufficient ${tokenUp}: you have ${balance.toFixed(4)} but tried to deposit ${amount}.` };
      }
    } catch (e) {
      if (e instanceof TokenAccountNotFoundError) {
        return { error: `You don't have a ${tokenUp} token account. Fund your wallet with ${tokenUp} first.` };
      }
      return { error: `Couldn't read ${tokenUp} balance: ${e.message}` };
    }
  }

  // Call Jupiter Lend deposit-instructions API
  const rawAmount = Math.floor(amount * Math.pow(10, decimals)).toString();

  let ixData;
  try {
    const res = await fetch(`${JUP_LEND_BASE}/earn/deposit-instructions`, {
      method: "POST",
      headers: apiHeaders(),
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        asset: mint,
        amount: rawAmount,
        signer: walletAddress,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`Jupiter Lend deposit API ${res.status}: ${errBody}`);
    }

    ixData = await res.json();
  } catch (e) {
    return { error: `Failed to build Jupiter Lend deposit: ${e.message}` };
  }

  // Build VersionedTransaction from returned instructions
  const instructions = (ixData.instructions ?? ixData.ixs ?? []).map(deserializeInstruction);
  if (instructions.length === 0) {
    return { error: "Jupiter Lend API returned empty instructions." };
  }

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const msg = new TransactionMessage({
    payerKey: wallet,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  const tx = new VersionedTransaction(msg);
  const serialized = Buffer.from(tx.serialize()).toString("base64");

  return {
    type: "transaction_preview",
    protocol: "Jupiter Lend",
    action: `Deposit ${amount} ${tokenUp} into Jupiter Earn`,
    serializedTx: serialized,
    estimatedOutput: `Jupiter Earn vault shares earning yield on ${amount} ${tokenUp}`,
    fee: "~0.000005 SOL network fee",
    requiresApproval: true,
    inputToken: tokenUp,
    inputAmount: amount,
    note: "Funds deposited into Jupiter Earn vaults. Withdraw anytime. Yield accrues automatically.",
  };
}

/**
 * Build a Jupiter Earn withdraw transaction.
 */
async function buildJupiterLendWithdrawTx(token, amount, walletAddress, network = "mainnet") {
  const tokenUp = token.toUpperCase();
  const mint = resolveMint(token);
  const decimals = resolveDecimals(token);
  const connection = getConnection(network);
  const wallet = new PublicKey(walletAddress);

  const rawAmount = Math.floor(amount * Math.pow(10, decimals)).toString();

  let ixData;
  try {
    const res = await fetch(`${JUP_LEND_BASE}/earn/withdraw-instructions`, {
      method: "POST",
      headers: apiHeaders(),
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        asset: mint,
        amount: rawAmount,
        signer: walletAddress,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`Jupiter Lend withdraw API ${res.status}: ${errBody}`);
    }

    ixData = await res.json();
  } catch (e) {
    return { error: `Failed to build Jupiter Lend withdrawal: ${e.message}` };
  }

  const instructions = (ixData.instructions ?? ixData.ixs ?? []).map(deserializeInstruction);
  if (instructions.length === 0) {
    return { error: "Jupiter Lend API returned empty instructions." };
  }

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const msg = new TransactionMessage({
    payerKey: wallet,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  const tx = new VersionedTransaction(msg);
  const serialized = Buffer.from(tx.serialize()).toString("base64");

  return {
    type: "transaction_preview",
    protocol: "Jupiter Lend",
    action: `Withdraw ${amount} ${tokenUp} from Jupiter Earn`,
    serializedTx: serialized,
    estimatedOutput: `${amount} ${tokenUp} returned to your wallet (plus accrued yield)`,
    fee: "~0.000005 SOL network fee",
    requiresApproval: true,
    inputToken: tokenUp,
    inputAmount: amount,
    note: "Withdrawal is instant. Accrued yield included in returned amount.",
  };
}

module.exports = { buildJupiterLendDepositTx, buildJupiterLendWithdrawTx };