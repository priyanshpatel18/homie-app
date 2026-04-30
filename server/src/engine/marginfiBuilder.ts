// @ts-nocheck
/**
 * marginfi transaction builder.
 * Uses the marginfi SDK (@mrgnlabs/marginfi-client-v2) to build
 * deposit, withdraw, and borrow instructions as unsigned VersionedTransactions.
 *
 * The SDK is initialised with a read-only wallet adapter (no signing on server).
 * Transactions are serialised and sent to the mobile client for user signing.
 */

const {
  Connection,
  PublicKey,
  VersionedTransaction,
  TransactionMessage,
} = require("@solana/web3.js");

const { getAssociatedTokenAddressSync, getAccount, TokenAccountNotFoundError } = require("@solana/spl-token");

const RPC_URLS = {
  mainnet: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
  devnet:  "https://api.devnet.solana.com",
};

// Well-known mints
const MINTS = {
  SOL:  new PublicKey("So11111111111111111111111111111111111111112"),
  USDC: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
  USDT: new PublicKey("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"),
  MSOL: new PublicKey("mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So"),
  JITOSOL: new PublicKey("J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn"),
};

const TOKEN_DECIMALS = {
  SOL: 9, USDC: 6, USDT: 6, MSOL: 9, JITOSOL: 9,
};

function getConnection(network = "mainnet") {
  return new Connection(RPC_URLS[network] ?? RPC_URLS.mainnet, "confirmed");
}

/**
 * Create a read-only wallet adapter for SDK initialisation.
 * The SDK needs a wallet to fetch data, but we never sign on the server.
 */
function makeReadOnlyWallet(publicKey) {
  return {
    publicKey,
    signTransaction: async (tx) => tx,
    signAllTransactions: async (txs) => txs,
  };
}

function resolveMint(token) {
  const up = token.toUpperCase().replace(/-/g, "");
  return MINTS[up] ?? new PublicKey(token);
}

function resolveDecimals(token) {
  const up = token.toUpperCase().replace(/-/g, "");
  return TOKEN_DECIMALS[up] ?? 9;
}

// Lazy-load the marginfi SDK (handles CJS/ESM compat)
let _sdkMod = null;
async function loadMarginfiSDK() {
  if (_sdkMod) return _sdkMod;
  try {
    _sdkMod = require("@mrgnlabs/marginfi-client-v2");
  } catch {
    _sdkMod = await import("@mrgnlabs/marginfi-client-v2");
  }
  return _sdkMod;
}

/**
 * Get a marginfi client for the given wallet.
 */
async function getClient(walletAddress, network = "mainnet") {
  const { MarginfiClient, getConfig } = await loadMarginfiSDK();
  const connection = getConnection(network);
  const wallet = makeReadOnlyWallet(new PublicKey(walletAddress));
  const config = getConfig(network === "devnet" ? "dev" : "production");
  return MarginfiClient.fetch(config, wallet, connection);
}

/**
 * Find a marginfi bank by token symbol or mint address.
 */
function findBank(client, token) {
  const up = token.toUpperCase().replace(/-/g, "");

  // Try by symbol first
  try {
    const bank = client.getBankByTokenSymbol(up);
    if (bank) return bank;
  } catch { /* ignore */ }

  // Try by mint
  try {
    const mint = resolveMint(token);
    const bank = client.getBankByMint(mint);
    if (bank) return bank;
  } catch { /* ignore */ }

  return null;
}

/**
 * Build a marginfi deposit transaction.
 */
async function buildMarginfiDepositTx(token, amount, walletAddress, network = "mainnet") {
  const tokenUp = token.toUpperCase();
  const decimals = resolveDecimals(token);
  const connection = getConnection(network);
  const walletPk = new PublicKey(walletAddress);

  // Validate balance for non-SOL tokens
  if (tokenUp !== "SOL") {
    try {
      const mint = resolveMint(token);
      const ata = getAssociatedTokenAddressSync(mint, walletPk);
      const acct = await getAccount(connection, ata);
      const balance = Number(acct.amount) / Math.pow(10, decimals);
      if (balance < amount) {
        return { error: `Insufficient ${tokenUp}: you have ${balance.toFixed(4)} but tried to deposit ${amount}.` };
      }
    } catch (e) {
      if (e instanceof TokenAccountNotFoundError) {
        return { error: `You don't have a ${tokenUp} token account. Fund your wallet first.` };
      }
      return { error: `Couldn't read ${tokenUp} balance: ${e.message}` };
    }
  }

  let client, bank;
  try {
    client = await getClient(walletAddress, network);
    bank = findBank(client, token);
    if (!bank) {
      return { error: `marginfi doesn't have a lending pool for ${tokenUp} on ${network}.` };
    }
  } catch (e) {
    return { error: `Failed to connect to marginfi: ${e.message}` };
  }

  try {
    // Get or create a marginfi account for the user
    let accounts = await client.getMarginfiAccountsForAuthority(walletPk);
    let account = accounts?.[0];

    let ixs = [];

    if (!account) {
      // Need to create a new marginfi account first
      const createIxs = await client.makeCreateMarginfiAccountIx(walletPk);
      ixs.push(...(Array.isArray(createIxs) ? createIxs : [createIxs]).filter(Boolean));

      // After creation, build deposit instructions
      const depositIxs = await client.makeDepositIx(amount, bank.address, walletPk);
      ixs.push(...(Array.isArray(depositIxs) ? depositIxs : [depositIxs]).filter(Boolean));
    } else {
      const depositIxs = await account.makeDepositIx(amount, bank.address);
      ixs.push(...(Array.isArray(depositIxs) ? depositIxs : [depositIxs]).filter(Boolean));
    }

    // Filter out non-instruction objects
    ixs = ixs.filter((ix) => ix && ix.programId && ix.keys);

    if (ixs.length === 0) {
      return { error: "marginfi SDK returned empty instructions." };
    }

    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    const msg = new TransactionMessage({
      payerKey: walletPk,
      recentBlockhash: blockhash,
      instructions: ixs,
    }).compileToV0Message();

    const tx = new VersionedTransaction(msg);
    const serialized = Buffer.from(tx.serialize()).toString("base64");

    return {
      type: "transaction_preview",
      protocol: "marginfi",
      action: `Deposit ${amount} ${tokenUp} into marginfi lending`,
      serializedTx: serialized,
      estimatedOutput: `Earning supply yield on ${amount} ${tokenUp} via marginfi`,
      fee: "~0.000005 SOL network fee",
      requiresApproval: true,
      inputToken: tokenUp,
      inputAmount: amount,
      note: "Deposits earn supply interest. You can withdraw anytime. Your deposit also counts as collateral for borrowing.",
    };
  } catch (e) {
    return { error: `Failed to build marginfi deposit: ${e.message}` };
  }
}

/**
 * Build a marginfi withdraw transaction.
 */
async function buildMarginfiWithdrawTx(token, amount, walletAddress, network = "mainnet") {
  const tokenUp = token.toUpperCase();
  const connection = getConnection(network);
  const walletPk = new PublicKey(walletAddress);

  let client, bank;
  try {
    client = await getClient(walletAddress, network);
    bank = findBank(client, token);
    if (!bank) {
      return { error: `marginfi doesn't have a lending pool for ${tokenUp} on ${network}.` };
    }
  } catch (e) {
    return { error: `Failed to connect to marginfi: ${e.message}` };
  }

  try {
    const accounts = await client.getMarginfiAccountsForAuthority(walletPk);
    const account = accounts?.[0];

    if (!account) {
      return { error: `You don't have a marginfi account. Deposit first to create one.` };
    }

    let ixs = await account.makeWithdrawIx(amount, bank.address);
    ixs = (Array.isArray(ixs) ? ixs : [ixs]).filter((ix) => ix && ix.programId && ix.keys);

    if (ixs.length === 0) {
      return { error: "marginfi SDK returned empty withdrawal instructions." };
    }

    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    const msg = new TransactionMessage({
      payerKey: walletPk,
      recentBlockhash: blockhash,
      instructions: ixs,
    }).compileToV0Message();

    const tx = new VersionedTransaction(msg);
    const serialized = Buffer.from(tx.serialize()).toString("base64");

    return {
      type: "transaction_preview",
      protocol: "marginfi",
      action: `Withdraw ${amount} ${tokenUp} from marginfi`,
      serializedTx: serialized,
      estimatedOutput: `${amount} ${tokenUp} returned to your wallet`,
      fee: "~0.000005 SOL network fee",
      requiresApproval: true,
      inputToken: tokenUp,
      inputAmount: amount,
      note: "Withdrawal is instant as long as liquidity is available. Accrued interest included.",
    };
  } catch (e) {
    return { error: `Failed to build marginfi withdrawal: ${e.message}` };
  }
}

/**
 * Build a marginfi borrow transaction.
 */
async function buildMarginfiBorrowTx(token, amount, walletAddress, network = "mainnet") {
  const tokenUp = token.toUpperCase();
  const connection = getConnection(network);
  const walletPk = new PublicKey(walletAddress);

  let client, bank;
  try {
    client = await getClient(walletAddress, network);
    bank = findBank(client, token);
    if (!bank) {
      return { error: `marginfi doesn't have a lending pool for ${tokenUp} on ${network}.` };
    }
  } catch (e) {
    return { error: `Failed to connect to marginfi: ${e.message}` };
  }

  try {
    const accounts = await client.getMarginfiAccountsForAuthority(walletPk);
    const account = accounts?.[0];

    if (!account) {
      return { error: `You need a marginfi account with deposited collateral before you can borrow. Deposit first.` };
    }

    let ixs = await account.makeBorrowIx(amount, bank.address);
    ixs = (Array.isArray(ixs) ? ixs : [ixs]).filter((ix) => ix && ix.programId && ix.keys);

    if (ixs.length === 0) {
      return { error: "marginfi SDK returned empty borrow instructions." };
    }

    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    const msg = new TransactionMessage({
      payerKey: walletPk,
      recentBlockhash: blockhash,
      instructions: ixs,
    }).compileToV0Message();

    const tx = new VersionedTransaction(msg);
    const serialized = Buffer.from(tx.serialize()).toString("base64");

    return {
      type: "transaction_preview",
      protocol: "marginfi",
      action: `Borrow ${amount} ${tokenUp} from marginfi`,
      serializedTx: serialized,
      estimatedOutput: `${amount} ${tokenUp} borrowed into your wallet`,
      fee: "~0.000005 SOL network fee",
      requiresApproval: true,
      inputToken: tokenUp,
      inputAmount: amount,
      riskLevel: "high",
      note: "Borrowed funds accrue interest. If your health factor drops below 1.0, your collateral may be liquidated. Monitor your position.",
    };
  } catch (e) {
    return { error: `Failed to build marginfi borrow: ${e.message}` };
  }
}

module.exports = { buildMarginfiDepositTx, buildMarginfiWithdrawTx, buildMarginfiBorrowTx };