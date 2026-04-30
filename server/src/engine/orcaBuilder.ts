// @ts-nocheck
/**
 * orcaBuilder.js — Orca Whirlpool transaction builder.
 *
 * Supports:
 *   1. buildOrcaSwapTx          — direct Orca swap (alternative to Jupiter)
 *   2. buildOrcaOpenFullRangeTx — open a full-range LP position on a whirlpool
 *   3. fetchOrcaPositions       — read caller's open LP positions
 *   4. buildOrcaHarvestTx       — harvest fees + rewards from an LP position
 *   5. buildOrcaCloseLpTx       — close an LP position and withdraw liquidity
 *
 * The SDK (@orca-so/whirlpools) uses @solana/kit v2 addresses.
 * We compile the returned instructions into a base64 VersionedTransaction
 * so the Homie app can deserialise and sign it with Privy, same as other txs.
 */

const {
  setRpc,
  setDefaultSlippageToleranceBps,
  swapInstructions,
  openFullRangePositionInstructions,
  fetchPositionsForOwner,
  harvestPositionInstructions,
  closePositionInstructions,
  fetchWhirlpoolsByTokenPair,
  orderMints,
} = require("@orca-so/whirlpools");

const {
  createSolanaRpc,
  address,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  compileTransaction,
  getBase64EncodedWireTransaction,
} = require("@solana/kit");

const { Keypair } = require("@solana/web3.js");
const { getToken } = require("../data/tokenRegistry");

const RPC_URLS = {
  mainnet: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
  devnet:  "https://api.devnet.solana.com",
};

const SOL_MINT  = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// BPS precision: 100 bps = 1%
const DEFAULT_SLIPPAGE_BPS = 50; // 0.5%

function getRpcUrl(network = "mainnet") {
  return RPC_URLS[network] ?? RPC_URLS.mainnet;
}

function initOrca(network = "mainnet") {
  const rpc = createSolanaRpc(getRpcUrl(network));
  setRpc(rpc);
  setDefaultSlippageToleranceBps(DEFAULT_SLIPPAGE_BPS);
  return rpc;
}

async function getLatestBlockhash(rpc) {
  const { value } = await rpc.getLatestBlockhash().send();
  return value;
}

async function compileToBase64(instructions, feePayer, blockhash, lastValidBlockHeight) {
  const msg = await pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(address(feePayer), m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(
      { blockhash, lastValidBlockHeight },
      m,
    ),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  const tx = compileTransaction(msg);
  return getBase64EncodedWireTransaction(tx);
}

// Resolve a token symbol/mint to a mint address string
async function resolveMint(tokenInput) {
  if (!tokenInput) return null;
  const upper = tokenInput.toUpperCase();
  if (upper === "SOL") return SOL_MINT;
  if (upper === "USDC") return USDC_MINT;
  // Try token registry
  const tok = await getToken(tokenInput).catch(() => null);
  if (tok?.mint) return tok.mint;
  // If it looks like a mint address already
  if (tokenInput.length >= 32 && tokenInput.length <= 44) return tokenInput;
  return null;
}

// ─── 1. Orca Swap ────────────────────────────────────────────────────────────

async function buildOrcaSwapTx(inputToken, outputToken, amount, walletAddress, network = "mainnet") {
  const rpc = initOrca(network);

  const inputMint  = await resolveMint(inputToken);
  const outputMint = await resolveMint(outputToken);
  if (!inputMint || !outputMint) {
    throw new Error(`Could not resolve mints for ${inputToken} / ${outputToken}`);
  }

  const inputSymbol  = inputToken.toUpperCase() === "SOL" ? "SOL" : inputToken;
  const outputSymbol = outputToken.toUpperCase() === "SOL" ? "SOL" : outputToken;

  // Amount in smallest unit (lamports for SOL, base units for SPL)
  const decimals  = inputSymbol === "SOL" ? 9 : 6; // default 6 for SPL tokens
  const amountBig = BigInt(Math.round(amount * Math.pow(10, decimals)));

  const { quote, instructions } = await swapInstructions(
    rpc,
    { inputMint: address(inputMint), outputMint: address(outputMint) },
    { inputAmount: amountBig },
    address(walletAddress),
  );

  const blockhash = await getLatestBlockhash(rpc);
  const serializedTx = await compileToBase64(
    instructions,
    walletAddress,
    blockhash.blockhash,
    blockhash.lastValidBlockHeight,
  );

  const estimatedOut = Number(quote.estimatedAmout ?? quote.estimatedAmount ?? 0n) / Math.pow(10, 6);

  return {
    serializedTx,
    inputMint,
    outputMint,
    amountIn: amount,
    estimatedOutput: `~${estimatedOut.toFixed(4)} ${outputSymbol}`,
    fee: `${(DEFAULT_SLIPPAGE_BPS / 100).toFixed(1)}% max slippage`,
    protocol: "Orca Whirlpools",
    requiresApproval: true,
  };
}

// ─── 2. Open Full-Range LP Position ──────────────────────────────────────────
// Full-range is the safest LP option — no impermanent loss from going "out of range".
// Users wanting a concentrated range should specify lowerPricePct / upperPricePct.

async function buildOrcaOpenLpTx({
  tokenA,
  tokenB,
  amountA,        // amount of tokenA to deposit (in human units)
  walletAddress,
  network = "mainnet",
}) {
  const rpc = initOrca(network);

  const mintA = await resolveMint(tokenA);
  const mintB = await resolveMint(tokenB);
  if (!mintA || !mintB) {
    throw new Error(`Could not resolve mints for ${tokenA} / ${tokenB}`);
  }

  // Orca requires mints in canonical order
  const [orderedA, orderedB] = orderMints(address(mintA), address(mintB));

  // Find the pool — returns all pools for this pair, sorted by liquidity
  const pools = await fetchWhirlpoolsByTokenPair(rpc, orderedA, orderedB);
  if (!pools?.length) {
    throw new Error(`No Orca Whirlpool found for ${tokenA}-${tokenB}`);
  }

  // Pick the most liquid pool
  const pool = pools.reduce((best, p) =>
    (p.liquidity ?? 0n) > (best.liquidity ?? 0n) ? p : best
  );

  const decimalsA = mintA === SOL_MINT ? 9 : 6;
  const amountBig = BigInt(Math.round(amountA * Math.pow(10, decimalsA)));

  // Generate a fresh position mint keypair (Orca creates an NFT per position)
  const positionMintKeypair = Keypair.generate();

  const { quote, instructions, positionMint } = await openFullRangePositionInstructions(
    rpc,
    pool.address,
    { tokenA: amountBig },
    DEFAULT_SLIPPAGE_BPS,
    address(walletAddress),
    address(positionMintKeypair.publicKey.toBase58()),
  );

  const blockhash = await getLatestBlockhash(rpc);
  const serializedTx = await compileToBase64(
    instructions,
    walletAddress,
    blockhash.blockhash,
    blockhash.lastValidBlockHeight,
  );

  const tokenALabel = tokenA.toUpperCase();
  const tokenBLabel = tokenB.toUpperCase();

  return {
    serializedTx,
    poolAddress: pool.address?.toString(),
    positionMint: positionMint?.toString(),
    tokenA: tokenALabel,
    tokenB: tokenBLabel,
    depositedA: amountA,
    estimatedOutput: `Full-range LP position in ${tokenALabel}-${tokenBLabel} Whirlpool`,
    fee: "Orca trading fees (no protocol fee for LPs)",
    protocol: "Orca Whirlpools",
    requiresApproval: true,
    note: "Full-range position — never goes out of range. Earns trading fees from all price levels.",
  };
}

// ─── 3. Fetch open LP positions for a wallet ─────────────────────────────────

async function fetchOrcaPositions(walletAddress, network = "mainnet") {
  const rpc = initOrca(network);
  try {
    const positions = await fetchPositionsForOwner(rpc, address(walletAddress));
    return positions.map((p) => ({
      positionMint: p.positionMint?.toString(),
      whirlpool:    p.data?.whirlpool?.toString(),
      liquidity:    p.data?.liquidity?.toString(),
      tickLower:    p.data?.tickLowerIndex,
      tickUpper:    p.data?.tickUpperIndex,
    }));
  } catch (err) {
    console.warn("[orcaBuilder] fetchPositions error:", err.message);
    return [];
  }
}

// ─── 4. Harvest fees + rewards from a position ───────────────────────────────

async function buildOrcaHarvestTx(positionMint, walletAddress, network = "mainnet") {
  const rpc = initOrca(network);

  const { instructions } = await harvestPositionInstructions(
    rpc,
    address(positionMint),
    address(walletAddress),
  );

  const blockhash = await getLatestBlockhash(rpc);
  const serializedTx = await compileToBase64(
    instructions,
    walletAddress,
    blockhash.blockhash,
    blockhash.lastValidBlockHeight,
  );

  return {
    serializedTx,
    positionMint,
    estimatedOutput: "Accumulated fees and rewards sent to your wallet",
    fee: "~0.000005 SOL network fee",
    protocol: "Orca Whirlpools",
    requiresApproval: true,
  };
}

// ─── 5. Close LP position (remove all liquidity + close NFT) ─────────────────

async function buildOrcaCloseLpTx(positionMint, walletAddress, network = "mainnet") {
  const rpc = initOrca(network);

  const { instructions } = await closePositionInstructions(
    rpc,
    address(positionMint),
    DEFAULT_SLIPPAGE_BPS,
    address(walletAddress),
  );

  const blockhash = await getLatestBlockhash(rpc);
  const serializedTx = await compileToBase64(
    instructions,
    walletAddress,
    blockhash.blockhash,
    blockhash.lastValidBlockHeight,
  );

  return {
    serializedTx,
    positionMint,
    estimatedOutput: "All liquidity + fees withdrawn, position NFT burned",
    fee: "~0.000005 SOL network fee",
    protocol: "Orca Whirlpools",
    requiresApproval: true,
  };
}

module.exports = {
  buildOrcaSwapTx,
  buildOrcaOpenLpTx,
  fetchOrcaPositions,
  buildOrcaHarvestTx,
  buildOrcaCloseLpTx,
};