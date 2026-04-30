// @ts-nocheck
/**
 * meteoraBuilder.js — Meteora DLMM + Vault transaction builder.
 *
 * DLMM: Dynamic Liquidity Market Maker — concentrated liquidity with price bins.
 * Vaults: Auto-compounding single-asset yield vaults.
 *
 * SDK: @meteora-ag/dlmm (web3.js v1), @meteora-ag/vault-sdk (web3.js v1)
 * All transactions returned as base64 (unsigned) for Privy signing.
 */

const { Connection, PublicKey, Keypair } = require("@solana/web3.js");
const BN = require("bn.js");
const DLMM = require("@meteora-ag/dlmm").default;
const { loadTokenRegistry, getToken } = require("../data/tokenRegistry");

const RPC_URLS = {
  mainnet: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
  devnet:  "https://api.devnet.solana.com",
};

const DLMM_API = "https://dlmm-api.meteora.ag";

const SOL_MINT  = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function getConnection(network = "mainnet") {
  return new Connection(RPC_URLS[network] ?? RPC_URLS.mainnet, "confirmed");
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

// Serialize a web3.js Transaction (unsigned) to base64
async function txToBase64(tx, walletAddress, connection) {
  const { blockhash } = await connection.getLatestBlockhash("finalized");
  tx.recentBlockhash = blockhash;
  tx.feePayer = new PublicKey(walletAddress);
  return Buffer.from(
    tx.serialize({ requireAllSignatures: false, verifySignatures: false })
  ).toString("base64");
}

// Find the best DLMM pool for a mint pair (highest TVL)
async function findBestPool(mintX, mintY) {
  try {
    const res = await fetch(
      `${DLMM_API}/pair/all_with_pagination?limit=100&sort_key=tvl&order_by=desc`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8_000) }
    );
    if (!res.ok) return null;
    const raw = await res.json();
    const pairs = Array.isArray(raw) ? raw : raw?.data ?? raw?.pairs ?? [];
    return pairs.find((p) =>
      (p.mint_x === mintX && p.mint_y === mintY) ||
      (p.mint_x === mintY && p.mint_y === mintX)
    ) ?? null;
  } catch {
    return null;
  }
}

// ─── 1. Open DLMM position + add liquidity ────────────────────────────────────
// "Add liquidity to SOL-USDC on Meteora"

async function buildMeteoraOpenDlmmTx({
  poolAddress,        // optional — if omitted, looks up by tokenX/tokenY
  tokenX,             // e.g. "SOL"
  tokenY,             // e.g. "USDC"
  amountX,            // amount of tokenX (human units)
  amountY = 0,        // amount of tokenY (human units), 0 for single-sided
  strategy = "Spot",  // "Spot" | "Curve" | "BidAsk"
  walletAddress,
  network = "mainnet",
}) {
  const connection = getConnection(network);

  let poolPubkey;
  let tokXInfo, tokYInfo;

  if (poolAddress) {
    poolPubkey = new PublicKey(poolAddress);
    tokXInfo = { decimals: 9 };
    tokYInfo = { decimals: 6 };
  } else {
    tokXInfo = await resolveMint(tokenX);
    tokYInfo = await resolveMint(tokenY);
    if (!tokXInfo || !tokYInfo) {
      return { error: `Could not resolve tokens: ${tokenX} / ${tokenY}` };
    }
    const pool = await findBestPool(tokXInfo.mint, tokYInfo.mint);
    if (!pool?.address) {
      return { error: `No Meteora DLMM pool found for ${tokenX}-${tokenY}. Try providing the pool address directly.` };
    }
    poolPubkey = new PublicKey(pool.address);
    poolAddress = pool.address;
  }

  const dlmm = await DLMM.create(connection, poolPubkey);
  const activeBin = await dlmm.getActiveBin();

  const BINS_RANGE = 10;
  const minBinId = activeBin.binId - BINS_RANGE;
  const maxBinId = activeBin.binId + BINS_RANGE;

  const strategyTypeMap = { Spot: 0, Curve: 1, BidAsk: 2 };
  const strategyType = strategyTypeMap[strategy] ?? 0;

  const totalXAmount = new BN(Math.floor(amountX * 10 ** tokXInfo.decimals));
  const totalYAmount = new BN(Math.floor(amountY * 10 ** tokYInfo.decimals));

  const positionKeypair = Keypair.generate();
  const user = new PublicKey(walletAddress);

  const txs = await dlmm.initializePositionAndAddLiquidityByStrategy({
    positionPubKey: positionKeypair.publicKey,
    user,
    totalXAmount,
    totalYAmount,
    strategy: { maxBinId, minBinId, strategyType },
  });

  const txArray = Array.isArray(txs) ? txs : [txs];
  const serializedTx = await txToBase64(txArray[0], walletAddress, connection);

  const xSym = (tokenX || "X").toUpperCase();
  const ySym = (tokenY || "Y").toUpperCase();

  return {
    type:            "transaction_preview",
    protocol:        "Meteora DLMM",
    action:          `Open ${xSym}-${ySym} LP position (${strategy} strategy)`,
    serializedTx,
    estimatedOutput: `Active LP position in ${xSym}-${ySym} — earns swap fees on every trade`,
    fee:             "Dynamic fee per trade (collected in-bin — no upfront fee)",
    requiresApproval: true,
    positionAddress: positionKeypair.publicKey.toBase58(),
    poolAddress:     poolPubkey.toBase58(),
    note:            `${strategy} strategy spreads liquidity ±${BINS_RANGE} bins around current price for optimal fee capture.`,
    additionalTxs:   txArray.length - 1,
    summary: {
      tokenX: xSym, tokenY: ySym, amountX, amountY, strategy,
      activeBinPrice: activeBin.price,
    },
  };
}

// ─── 2. Remove liquidity from DLMM position ───────────────────────────────────

async function buildMeteoraRemoveLiquidityTx({
  poolAddress,
  positionAddress,
  bps = 10000,    // basis points to remove (10000 = 100% = full withdrawal)
  walletAddress,
  network = "mainnet",
}) {
  const connection = getConnection(network);
  const poolPubkey     = new PublicKey(poolAddress);
  const positionPubkey = new PublicKey(positionAddress);
  const user           = new PublicKey(walletAddress);

  const dlmm = await DLMM.create(connection, poolPubkey);

  // Fetch position to get bin range
  const { userPositions } = await dlmm.getPositionsByUserAndLbPair(user);
  const myPos = userPositions?.find(
    (p) => p.publicKey.toBase58() === positionAddress
  );
  if (!myPos) return { error: "Position not found in this pool. Check the pool and position addresses." };

  const fromBinId = myPos.positionData.lowerBinId;
  const toBinId   = myPos.positionData.upperBinId;

  const txs = await dlmm.removeLiquidity({
    position: positionPubkey,
    user,
    fromBinId,
    toBinId,
    bps: new BN(bps),
    shouldClaimAndClose: bps >= 10000,
  });

  const txArray = Array.isArray(txs) ? txs : [txs];
  const serializedTx = await txToBase64(txArray[0], walletAddress, connection);
  const pct = (bps / 100).toFixed(0);

  return {
    type:            "transaction_preview",
    protocol:        "Meteora DLMM",
    action:          `Remove ${pct}% liquidity from position`,
    serializedTx,
    estimatedOutput: `${pct}% of deposited tokens + accrued fees returned to wallet`,
    fee:             "~0.000005 SOL network fee",
    requiresApproval: true,
    additionalTxs:   txArray.length - 1,
  };
}

// ─── 3. Claim swap fees from DLMM position ────────────────────────────────────

async function buildMeteoraClaimFeesTx({
  poolAddress,
  positionAddress,
  walletAddress,
  network = "mainnet",
}) {
  const connection     = getConnection(network);
  const poolPubkey     = new PublicKey(poolAddress);
  const positionPubkey = new PublicKey(positionAddress);
  const user           = new PublicKey(walletAddress);

  const dlmm = await DLMM.create(connection, poolPubkey);

  const tx = await dlmm.claimAllSwapFee({
    owner:     user,
    positions: [{ publicKey: positionPubkey }],
  });

  const serializedTx = await txToBase64(tx, walletAddress, connection);

  return {
    type:            "transaction_preview",
    protocol:        "Meteora DLMM",
    action:          "Claim accumulated swap fees",
    serializedTx,
    estimatedOutput: "Swap fees credited to your wallet (in both pool tokens)",
    fee:             "~0.000005 SOL network fee",
    requiresApproval: true,
  };
}

// ─── 4. Claim LM rewards from DLMM position ──────────────────────────────────

async function buildMeteoraClaimRewardsTx({
  poolAddress,
  positionAddress,
  walletAddress,
  network = "mainnet",
}) {
  const connection     = getConnection(network);
  const poolPubkey     = new PublicKey(poolAddress);
  const positionPubkey = new PublicKey(positionAddress);
  const user           = new PublicKey(walletAddress);

  const dlmm = await DLMM.create(connection, poolPubkey);

  const tx = await dlmm.claimAllRewardsByPosition({
    owner:    user,
    position: positionPubkey,
  });

  const serializedTx = await txToBase64(tx, walletAddress, connection);

  return {
    type:            "transaction_preview",
    protocol:        "Meteora DLMM",
    action:          "Claim liquidity mining rewards",
    serializedTx,
    estimatedOutput: "LM reward tokens credited to your wallet",
    fee:             "~0.000005 SOL network fee",
    requiresApproval: true,
  };
}

// ─── 5. Vault deposit ─────────────────────────────────────────────────────────

async function buildMeteoraVaultDepositTx({
  token,          // token symbol, e.g. "SOL", "USDC"
  amount,         // human units
  walletAddress,
  network = "mainnet",
}) {
  const connection = getConnection(network);
  const tokInfo    = await resolveMint(token);
  if (!tokInfo) return { error: `Unknown token: ${token}` };

  // Lazy-load VaultImpl (avoids pulling the dep at startup if unused)
  let VaultImpl;
  try {
    VaultImpl = require("@meteora-ag/vault-sdk").default;
  } catch {
    return { error: "Meteora Vault SDK not installed. Run: npm install @meteora-ag/vault-sdk" };
  }

  const tokenInfo = {
    chainId:  101,
    address:  tokInfo.mint,
    symbol:   token.toUpperCase(),
    decimals: tokInfo.decimals,
    name:     token.toUpperCase(),
    logoURI:  "",
    tags:     [],
  };

  const cluster = network === "devnet" ? "devnet" : "mainnet-beta";
  const vault   = await VaultImpl.create(connection, tokenInfo, { cluster });

  const user      = new PublicKey(walletAddress);
  const amountRaw = new BN(Math.floor(amount * 10 ** tokInfo.decimals));

  const tx = await vault.deposit(user, amountRaw);
  const serializedTx = await txToBase64(tx, walletAddress, connection);

  const sym = token.toUpperCase();

  return {
    type:            "transaction_preview",
    protocol:        "Meteora Vault",
    action:          `Deposit ${amount} ${sym} into Meteora vault`,
    serializedTx,
    estimatedOutput: `${sym} depositing into auto-compounding vault — earns yield + LM rewards`,
    fee:             "0.05% management fee (annual, built into vault APY)",
    requiresApproval: true,
    note:            "Meteora vaults auto-compound yield — no manual claiming needed.",
  };
}

// ─── 6. Vault withdraw ────────────────────────────────────────────────────────

async function buildMeteoraVaultWithdrawTx({
  token,
  amount,
  walletAddress,
  network = "mainnet",
}) {
  const connection = getConnection(network);
  const tokInfo    = await resolveMint(token);
  if (!tokInfo) return { error: `Unknown token: ${token}` };

  let VaultImpl;
  try {
    VaultImpl = require("@meteora-ag/vault-sdk").default;
  } catch {
    return { error: "Meteora Vault SDK not installed. Run: npm install @meteora-ag/vault-sdk" };
  }

  const tokenInfo = {
    chainId:  101,
    address:  tokInfo.mint,
    symbol:   token.toUpperCase(),
    decimals: tokInfo.decimals,
    name:     token.toUpperCase(),
    logoURI:  "",
    tags:     [],
  };

  const cluster = network === "devnet" ? "devnet" : "mainnet-beta";
  const vault   = await VaultImpl.create(connection, tokenInfo, { cluster });

  const user      = new PublicKey(walletAddress);
  const amountRaw = new BN(Math.floor(amount * 10 ** tokInfo.decimals));

  const tx = await vault.withdraw(user, amountRaw);
  const serializedTx = await txToBase64(tx, walletAddress, connection);

  const sym = token.toUpperCase();

  return {
    type:            "transaction_preview",
    protocol:        "Meteora Vault",
    action:          `Withdraw ${amount} ${sym} from Meteora vault`,
    serializedTx,
    estimatedOutput: `${amount} ${sym} + accrued yield returned to your wallet`,
    fee:             "~0.000005 SOL network fee",
    requiresApproval: true,
  };
}

// ─── 7. Fetch user's DLMM positions ──────────────────────────────────────────

async function fetchMeteoraUserPositions(walletAddress, network = "mainnet") {
  const connection = getConnection(network);
  try {
    const user = new PublicKey(walletAddress);
    const positionsMap = await DLMM.getAllLbPairPositionsByUser(connection, user);

    const results = [];
    for (const [poolAddress, posData] of positionsMap) {
      for (const pos of (posData.userPositions ?? [])) {
        results.push({
          positionAddress: pos.publicKey?.toBase58(),
          poolAddress:     poolAddress.toString(),
          lowerBinId:      pos.positionData?.lowerBinId,
          upperBinId:      pos.positionData?.upperBinId,
          liquidityShares: pos.positionData?.totalXAmount?.toString(),
          feeX:            pos.positionData?.feeX?.toString(),
          feeY:            pos.positionData?.feeY?.toString(),
        });
      }
    }
    return { count: results.length, positions: results };
  } catch (err) {
    console.warn("[meteoraBuilder] fetchUserPositions error:", err.message);
    return { count: 0, positions: [], error: err.message };
  }
}

module.exports = {
  buildMeteoraOpenDlmmTx,
  buildMeteoraRemoveLiquidityTx,
  buildMeteoraClaimFeesTx,
  buildMeteoraClaimRewardsTx,
  buildMeteoraVaultDepositTx,
  buildMeteoraVaultWithdrawTx,
  fetchMeteoraUserPositions,
};