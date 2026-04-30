// @ts-nocheck
/**
 * Kamino CASH Vault transaction builder.
 * Uses KaminoVaultClient from @kamino-finance/klend-sdk to build
 * deposit/withdraw instructions for Kamino's delta-neutral yield vaults.
 */

const {
  Connection,
  PublicKey,
  VersionedTransaction,
  TransactionMessage,
  LAMPORTS_PER_SOL,
} = require("@solana/web3.js");

const { KaminoVaultClient } = require("@kamino-finance/klend-sdk");
const { getAssociatedTokenAddressSync, getAccount, TokenAccountNotFoundError } = require("@solana/spl-token");
const BN = require("bn.js");

const RPC_URLS = {
  mainnet: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
  devnet:  "https://api.devnet.solana.com",
};

// Known token mints
const MINTS = {
  USDC:  new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
  USDT:  new PublicKey("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"),
  USDH:  new PublicKey("USDH1SM1ojwWUga67PGrgFWUHibbjqMvuMaDkRJTgkX"),
};

const TOKEN_DECIMALS = { USDC: 6, USDT: 6, USDH: 9 };

function getConnection(network = "mainnet") {
  return new Connection(RPC_URLS[network] ?? RPC_URLS.mainnet, "confirmed");
}

// Find the CASH vault for a given token mint
async function findCashVault(client, tokenMint) {
  // Try by token mint first
  let vaults = [];
  try {
    vaults = await client.getAllVaultsForToken(tokenMint);
  } catch {}

  if (!vaults.length) {
    // Fall back to all vaults, filter by name
    try {
      const all = await client.getAllVaults();
      vaults = all.filter((v) => {
        const name = (v.state?.name ?? "").toLowerCase();
        return name.includes("cash");
      });
    } catch {}
  }

  if (!vaults.length) return null;

  // Prefer vault with "cash" in the name
  const cash = vaults.find((v) => (v.state?.name ?? "").toLowerCase().includes("cash"));
  return cash ?? vaults[0];
}

// Build a CASH vault deposit transaction
async function buildKaminoCashDepositTx(token, amount, walletAddress, network = "mainnet") {
  const tokenUp = token.toUpperCase();
  const mint    = MINTS[tokenUp];
  if (!mint) {
    return { error: `CASH vault supports USDC, USDT. "${token}" not supported.` };
  }

  const decimals = TOKEN_DECIMALS[tokenUp] ?? 6;
  const connection = getConnection(network);
  const wallet     = new PublicKey(walletAddress);

  // Check user token balance
  let userAta, tokenBalance;
  try {
    userAta      = getAssociatedTokenAddressSync(mint, wallet);
    const acct   = await getAccount(connection, userAta);
    tokenBalance = Number(acct.amount) / Math.pow(10, decimals);
  } catch (e) {
    if (e instanceof TokenAccountNotFoundError) {
      return { error: `You don't have a ${tokenUp} token account. Fund your wallet with ${tokenUp} first.` };
    }
    return { error: `Couldn't read ${tokenUp} balance: ${e.message}` };
  }

  if (tokenBalance < amount) {
    return { error: `Insufficient ${tokenUp}: you have ${tokenBalance.toFixed(2)} but tried to deposit ${amount}.` };
  }

  // Build instructions via KaminoVaultClient
  const client = new KaminoVaultClient(connection);
  const vault  = await findCashVault(client, mint);

  if (!vault) {
    return {
      error: `Kamino CASH vault for ${tokenUp} not found on ${network}. It may only be available on mainnet.`,
    };
  }

  // Amount in raw (lamports equivalent for token)
  const rawAmount = new BN(Math.floor(amount * Math.pow(10, decimals)));

  // Build deposit instructions
  let depositIxs;
  try {
    depositIxs = await client.depositIxs(vault, rawAmount, wallet);
  } catch (e) {
    return { error: `Failed to build deposit instructions: ${e.message}` };
  }

  const ixs = Array.isArray(depositIxs) ? depositIxs : [depositIxs];

  // Fetch blockhash and build versioned transaction
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");

  const msg = new TransactionMessage({
    payerKey:    wallet,
    recentBlockhash: blockhash,
    instructions: ixs,
  }).compileToV0Message();

  const tx = new VersionedTransaction(msg);
  const serialized = Buffer.from(tx.serialize()).toString("base64");

  return {
    type:              "transaction_preview",
    protocol:          "Kamino CASH Vault",
    action:            `Deposit ${amount} ${tokenUp} into Kamino CASH (delta-neutral yield)`,
    serializedTx:      serialized,
    estimatedOutput:   `k${tokenUp} vault shares representing ${amount} ${tokenUp} earning yield`,
    fee:               "~0.000005 SOL network fee",
    requiresApproval:  true,
    vaultAddress:      vault.address?.toBase58?.() ?? vault.pubkey?.toString() ?? null,
    note:              "Managed by Gauntlet. Capital deployed into delta-neutral strategies. Withdraw anytime.",
  };
}

// Build a CASH vault withdrawal transaction
async function buildKaminoCashWithdrawTx(token, amount, walletAddress, network = "mainnet") {
  const tokenUp = token.toUpperCase();
  const mint    = MINTS[tokenUp];
  if (!mint) {
    return { error: `CASH vault supports USDC, USDT. "${token}" not supported.` };
  }

  const decimals   = TOKEN_DECIMALS[tokenUp] ?? 6;
  const connection = getConnection(network);
  const wallet     = new PublicKey(walletAddress);

  const client = new KaminoVaultClient(connection);
  const vault  = await findCashVault(client, mint);

  if (!vault) {
    return { error: `Kamino CASH vault for ${tokenUp} not found on ${network}.` };
  }

  const rawAmount = new BN(Math.floor(amount * Math.pow(10, decimals)));

  let withdrawIxs;
  try {
    withdrawIxs = await client.withdrawIxs(vault, rawAmount, wallet);
  } catch (e) {
    return { error: `Failed to build withdrawal instructions: ${e.message}` };
  }

  const ixs = Array.isArray(withdrawIxs) ? withdrawIxs : [withdrawIxs];

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const msg = new TransactionMessage({
    payerKey:        wallet,
    recentBlockhash: blockhash,
    instructions:    ixs,
  }).compileToV0Message();

  const tx = new VersionedTransaction(msg);
  const serialized = Buffer.from(tx.serialize()).toString("base64");

  return {
    type:             "transaction_preview",
    protocol:         "Kamino CASH Vault",
    action:           `Withdraw ${amount} ${tokenUp} from Kamino CASH vault`,
    serializedTx:     serialized,
    estimatedOutput:  `${amount} ${tokenUp} returned to your wallet`,
    fee:              "~0.000005 SOL network fee",
    requiresApproval: true,
    note:             "Withdrawal is instant. Any accrued yield is included.",
  };
}

module.exports = { buildKaminoCashDepositTx, buildKaminoCashWithdrawTx };