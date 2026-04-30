// @ts-nocheck
/**
 * Transaction Builder — constructs real Solana transactions for:
 * 1. Marinade Liquid Staking  (SOL → mSOL via Marinade SDK — used by agent strategies)
 * 2. Marinade Native Staking  (SOL → stake account — kept for direct/explicit requests)
 * 3. Jupiter swaps            (any token → any token)
 * 4. Kamino lending deposits  (real on-chain via klend-sdk)
 *
 * Returns serialized base64 transactions for the app to deserialize,
 * show a preview, and sign with the Privy embedded wallet.
 */

const {
  Connection,
  PublicKey,
  VersionedTransaction,
  TransactionMessage,
  LAMPORTS_PER_SOL,
} = require("@solana/web3.js");

const BN = require("bn.js");

const {
  Marinade,
  MarinadeConfig,
} = require("@marinade.finance/marinade-ts-sdk");

const {
  NativeStakingSDK,
  NativeStakingConfig,
} = require("@marinade.finance/native-staking-sdk");

const {
  KaminoMarket,
  KaminoAction,
  VanillaObligation,
} = require("@kamino-finance/klend-sdk");

const { noopSigner } = require("@kamino-finance/klend-sdk/dist/utils/signer");

const {
  PROGRAM_ID: KAMINO_PROGRAM_ID,
} = require("@kamino-finance/klend-sdk/dist/@codegen/klend/programId");

const { loadTokenRegistry, getToken } = require("../data/tokenRegistry");

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

const RPC_URLS = {
  mainnet: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
  devnet:  "https://api.devnet.solana.com",
};

// Jupiter API v2 — authenticated endpoints give higher rate limits
const JUP_API_KEY   = process.env.JUP_API_KEY || "";
const JUP_SWAP_BASE = "https://api.jup.ag/swap/v1";

function jupHeaders() {
  const h = { "Content-Type": "application/json" };
  if (JUP_API_KEY) h["Authorization"] = `Bearer ${JUP_API_KEY}`;
  return h;
}

// Kamino mainnet lending market — no public devnet market exists.
// Devnet markets must be created via kamino-manager CLI by each team.
const KAMINO_MAINNET_MARKET = "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF";

const SLOT_DURATION_MS = 460;

function getRpc(network = "mainnet") {
  return RPC_URLS[network] ?? RPC_URLS.mainnet;
}


// ─── 1. Marinade Liquid Staking (LST) ────────────────────────────────────────
//
// Uses @marinade.finance/marinade-ts-sdk to call the Marinade Finance program
// directly. The user deposits SOL and receives mSOL — a liquid staking token
// that appreciates vs SOL over time as staking rewards accrue.
// Used by the agent for all strategy recommendations.

async function buildMarinadeStakeTx(amountSol, walletAddress, network = "mainnet") {
  if (network === "devnet") {
    return { error: "Marinade liquid staking is mainnet-only. Switch to mainnet to stake SOL → mSOL." };
  }
  if (amountSol <= 0) return { error: "Amount must be greater than 0" };
  if (amountSol < 0.01) return { error: "Minimum liquid stake is 0.01 SOL" };

  try {
    const connection = new Connection(getRpc(network), "confirmed");
    const walletPubkey = new PublicKey(walletAddress);

    const config = new MarinadeConfig({
      connection,
      publicKey: walletPubkey,
    });
    const marinade = new Marinade(config);

    const amountLamports = new BN(Math.floor(amountSol * LAMPORTS_PER_SOL));
    const { transaction } = await marinade.deposit(amountLamports);

    // Attach blockhash and fee payer (client will sign)
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = walletPubkey;

    const serializedTx = transaction
      .serialize({ requireAllSignatures: false })
      .toString("base64");

    return {
      type: "transaction_preview",
      protocol: "Marinade Liquid Staking",
      action: `Liquid stake ${amountSol} SOL → mSOL`,
      serializedTx,
      estimatedOutput: `~${amountSol.toFixed(4)} mSOL`,
      fee: "~0.000005 SOL (network fee)",
      why: "You receive mSOL — a liquid staking token that earns ~6–7% APY automatically as it appreciates vs SOL. No lockup: trade it, use it as collateral, or swap back to SOL anytime.",
      requiresApproval: true,
    };
  } catch (err) {
    console.error("[Marinade LST] error:", err.message);
    return { error: `Marinade liquid staking failed: ${err.message}` };
  }
}

// ─── 2. Marinade Liquid Unstake ──────────────────────────────────────────────
//
// Instantly converts mSOL back to SOL using Marinade's liquidity pool.
// Charges a small fee (~0.3%). No waiting — funds arrive in the same tx.
// Mainnet only — Marinade SDK targets mainnet.

async function buildMarinadeUnstakeTx(amountMsol, walletAddress, network = "mainnet") {
  if (network === "devnet") {
    return { error: "Marinade unstaking is mainnet-only. Switch to mainnet." };
  }
  if (amountMsol <= 0) return { error: "Amount must be greater than 0" };

  try {
    const connection = new Connection(getRpc(network), "confirmed");
    const walletPubkey = new PublicKey(walletAddress);

    const config = new MarinadeConfig({ connection, publicKey: walletPubkey });
    const marinade = new Marinade(config);

    // amountLamports here = mSOL amount expressed in lamports (mSOL has 9 decimals)
    const amountLamports = new BN(Math.floor(amountMsol * LAMPORTS_PER_SOL));
    const { transaction } = await marinade.liquidUnstake(amountLamports);

    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = walletPubkey;

    const serializedTx = transaction
      .serialize({ requireAllSignatures: false })
      .toString("base64");

    // Liquid unstake fee is ~0.3% of the amount
    const feeEstimate = (amountMsol * 0.003).toFixed(4);

    return {
      type: "transaction_preview",
      protocol: "Marinade Liquid Unstake",
      action: `Unstake ${amountMsol} mSOL → SOL`,
      serializedTx,
      estimatedOutput: `~${(amountMsol * 0.997).toFixed(4)} SOL (after ~0.3% fee)`,
      fee: `~${feeEstimate} mSOL unstake fee + network fees`,
      why: "Instant liquid unstake via Marinade's SOL liquidity pool. A small fee (~0.3%) applies. For fee-free unstaking you can use delayed unstake (~2–3 days).",
      requiresApproval: true,
    };
  } catch (err) {
    console.error("[Marinade Unstake] error:", err.message);
    return { error: `Marinade unstake failed: ${err.message}` };
  }
}

// ─── 2b. Marinade Native Staking ─────────────────────────────────────────────
//
// Uses @marinade.finance/native-staking-sdk to delegate SOL to Marinade's
// validator set via a stake account. SOL is locked (~2-3 day unstake delay).
// Kept for direct/explicit requests — NOT used by agent strategies.

async function buildNativeStakeTx(amountSol, walletAddress, network = "mainnet") {
  if (network === "devnet") {
    return { error: "Marinade native staking is mainnet-only. Switch to mainnet to stake." };
  }
  if (amountSol <= 0) return { error: "Amount must be greater than 0" };
  if (amountSol < 0.01) return { error: "Minimum stake is 0.01 SOL" };

  try {
    const connection = new Connection(getRpc(network), "confirmed");
    const config = new NativeStakingConfig({ connection });
    const sdk = new NativeStakingSDK(config);

    const ownerPubkey = new PublicKey(walletAddress);
    const lamports = new BN(Math.floor(amountSol * LAMPORTS_PER_SOL));

    const { createAuthorizedStake, stakeKeypair } =
      sdk.buildCreateAuthorizedStakeInstructions(ownerPubkey, lamports);

    const { blockhash } = await connection.getLatestBlockhash();

    const tx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: ownerPubkey,
        recentBlockhash: blockhash,
        instructions: createAuthorizedStake,
      }).compileToV0Message()
    );

    tx.sign([stakeKeypair]);
    const serializedTx = Buffer.from(tx.serialize()).toString("base64");

    return {
      type: "transaction_preview",
      protocol: "Marinade Native Staking",
      action: `Native stake ${amountSol} SOL via Marinade`,
      serializedTx,
      estimatedOutput: `${amountSol} SOL delegated to Marinade validators`,
      fee: "~0.002 SOL (stake account rent)",
      why: "SOL is delegated to Marinade's curated validator set (~7% APY). Note: non-liquid — unstaking takes 2–3 days. Consider liquid staking (mSOL) if you want flexibility.",
      requiresApproval: true,
    };
  } catch (err) {
    console.error("[Marinade Native] error:", err.message);
    return { error: `Marinade native staking failed: ${err.message}` };
  }
}

// ─── 3. Jupiter Swap ────────────────────────────────────────────────────────

async function buildJupiterSwapTx(inputToken, outputToken, amount, walletAddress, network = "mainnet") {
  await loadTokenRegistry();

  const inputTok = getToken(inputToken);
  const outputTok = getToken(outputToken);

  if (!inputTok) {
    return { error: `Unknown input token: ${inputToken}. Check the symbol or use a mint address.` };
  }
  if (!outputTok) {
    return { error: `Unknown output token: ${outputToken}. Check the symbol or use a mint address.` };
  }
  if (amount <= 0) return { error: "Amount must be greater than 0" };
  if (network === "devnet") {
    return { error: "Jupiter swaps are not available on devnet. Switch to mainnet to swap tokens." };
  }

  const inputSymbol = inputToken.toUpperCase();
  const outputSymbol = outputToken.toUpperCase();
  const inputMint = inputTok.address;
  const outputMint = outputTok.address;
  const decimals = inputTok.decimals ?? 9;
  const amountRaw = Math.floor(amount * 10 ** decimals);

  try {
    const quoteUrl = new URL(`${JUP_SWAP_BASE}/quote`);
    quoteUrl.searchParams.set("inputMint", inputMint);
    quoteUrl.searchParams.set("outputMint", outputMint);
    quoteUrl.searchParams.set("amount", amountRaw.toString());
    quoteUrl.searchParams.set("slippageBps", "50");

    const quoteRes = await fetch(quoteUrl.toString(), {
      headers: jupHeaders(),
      signal: AbortSignal.timeout(12000),
    });
    if (!quoteRes.ok) {
      const err = await quoteRes.text();
      return { error: `Jupiter quote failed: ${err}` };
    }
    const quote = await quoteRes.json();
    if (quote.error) return { error: `Jupiter quote: ${quote.error}` };

    const swapRes = await fetch(`${JUP_SWAP_BASE}/swap`, {
      method: "POST",
      headers: jupHeaders(),
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: walletAddress,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: "auto",
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!swapRes.ok) {
      const err = await swapRes.text();
      return { error: `Jupiter swap build failed: ${err}` };
    }
    const swapData = await swapRes.json();
    if (swapData.error) return { error: `Jupiter swap: ${swapData.error}` };

    const outDecimals = outputTok.decimals ?? 9;
    const estimatedOut = (
      parseInt(quote.outAmount, 10) / 10 ** outDecimals
    ).toFixed(outDecimals > 4 ? 4 : outDecimals);

    const priceImpact = quote.priceImpactPct
      ? parseFloat(quote.priceImpactPct).toFixed(3)
      : "< 0.01";

    return {
      type: "transaction_preview",
      protocol: "Jupiter",
      action: `Swap ${amount} ${inputSymbol} → ${outputSymbol}`,
      serializedTx: swapData.swapTransaction,
      estimatedOutput: `~${estimatedOut} ${outputSymbol}`,
      priceImpact: `${priceImpact}%`,
      fee: "~0.000005 SOL (network fee)",
      why: `Best route found across ${quote.routePlan?.length || "multiple"} DEXes via Jupiter.`,
      requiresApproval: true,
    };
  } catch (err) {
    return { error: `Jupiter swap failed: ${err.message}` };
  }
}

// ─── 4. Kamino Lending Deposit ──────────────────────────────────────────────
//
// Uses @kamino-finance/klend-sdk to build a real on-chain deposit transaction.
// Loads the main Kamino market, builds deposit instructions for the token,
// serializes with a noop signer (client signs the actual transaction).

async function buildKaminoLendTx(token, amount, walletAddress, network = "mainnet") {
  if (network === "devnet") {
    return { error: "Kamino lending has no public devnet market. Switch to mainnet to lend." };
  }
  await loadTokenRegistry();

  const symbol = token.toUpperCase();
  if (amount <= 0) return { error: "Amount must be greater than 0" };

  const tokenInfo = getToken(token);
  if (!tokenInfo) {
    return { error: `Unsupported token: ${token}. Check the symbol or use a mint address.` };
  }
  const mintAddress = tokenInfo.address;

  // Kamino only lends stablecoins and major assets — SOL needs to be wSOL
  const lendableTokens = ["SOL", "USDC", "USDT", "MSOL"];
  if (!lendableTokens.includes(symbol)) {
    return { error: `${symbol} is not available for Kamino lending. Try: SOL, USDC, USDT, mSOL` };
  }

  // Kamino obligation account rent: ~0.24 SOL (241,651,207 lamports).
  // Required only on the first ever deposit when the account doesn't exist.
  const OBLIGATION_RENT_SOL = 0.25; // slightly above actual to give headroom

  try {
    const rpc = createSolanaRpc(getRpc(network));

    // Load Kamino mainnet market
    const market = await KaminoMarket.load(
      rpc,
      address(KAMINO_MAINNET_MARKET),
      SLOT_DURATION_MS
    );
    if (!market) return { error: "Failed to load Kamino market" };

    // Noop signer — server doesn't hold user keys, client signs the tx
    const owner = noopSigner(address(walletAddress));

    const decimals = tokenInfo.decimals ?? 6;
    const amountLamports = Math.floor(amount * 10 ** decimals).toString();

    // Load existing obligation if the wallet has deposited before.
    // Passing the live obligation skips the InitObligation instruction,
    // which would fail with 0x1 (account already initialized) otherwise.
    let obligation;
    try {
      obligation = await market.getUserVanillaObligation(address(walletAddress));
    } catch {
      // No obligation yet — first deposit; SDK will include InitObligation.
      // Pre-flight: wallet needs ~0.25 SOL to cover the obligation account rent.
      const connection = new Connection(getRpc(network), "confirmed");
      const balance = await connection.getBalance(new PublicKey(walletAddress));
      const balanceSol = balance / LAMPORTS_PER_SOL;
      const needed = (symbol === "SOL" ? amount : 0) + OBLIGATION_RENT_SOL;
      if (balanceSol < needed) {
        return {
          error: `Insufficient SOL balance. Your first Kamino deposit requires ~${OBLIGATION_RENT_SOL} SOL to create your lending account on-chain, plus the deposit amount. You have ${balanceSol.toFixed(4)} SOL — need at least ${needed.toFixed(2)} SOL.`,
        };
      }
      obligation = new VanillaObligation(KAMINO_PROGRAM_ID);
      isNewObligation = true;
    }

    // Build deposit instructions
    const depositAction = await KaminoAction.buildDepositTxns(
      market,
      amountLamports,
      address(mintAddress),
      owner,
      obligation,
      true,       // useV2Ixs
      undefined   // no scope refresh config
    );

    const ixs = KaminoAction.actionToIxs(depositAction);
    if (!ixs.length) return { error: "No instructions generated for deposit" };

    // Get recent blockhash
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    // Build v2 transaction message
    const txMessage = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayer(owner.address, tx),
      (tx) => appendTransactionMessageInstructions(ixs, tx),
      (tx) =>
        setTransactionMessageLifetimeUsingBlockhash(
          {
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
          },
          tx
        )
    );

    // Compile and serialize (unsigned — client will sign)
    const compiledTx = compileTransaction(txMessage);
    const serializedTx = getBase64EncodedWireTransaction(compiledTx);

    return {
      type: "transaction_preview",
      protocol: "Kamino Lend",
      action: `Deposit ${amount} ${symbol} into Kamino lending`,
      serializedTx,
      estimatedOutput: `Earn lending yield on ${amount} ${symbol}`,
      fee: "~0.000005 SOL (network fee)",
      why: "Deposit into Kamino lending to earn yield from borrowers. Withdraw anytime. Your position earns interest every second.",
      requiresApproval: true,
    };
  } catch (err) {
    console.error("Kamino lend error:", err.message);
    return { error: `Kamino deposit failed: ${err.message}` };
  }
}

// ─── 5. Kamino Withdraw ───────────────────────────────────────────────────────
//
// Withdraws a previously deposited token from Kamino lending.
// Requires the user to have an existing obligation (must have deposited before).

async function buildKaminoWithdrawTx(token, amount, walletAddress, network = "mainnet") {
  if (network === "devnet") {
    return { error: "Kamino has no public devnet market. Switch to mainnet to withdraw." };
  }
  await loadTokenRegistry();

  const symbol = token.toUpperCase();
  if (amount <= 0) return { error: "Amount must be greater than 0" };

  const tokenInfo = getToken(token);
  if (!tokenInfo) {
    return { error: `Unsupported token: ${token}. Check the symbol or use a mint address.` };
  }
  const mintAddress = tokenInfo.address;

  const lendableTokens = ["SOL", "USDC", "USDT", "MSOL"];
  if (!lendableTokens.includes(symbol)) {
    return { error: `${symbol} is not available on Kamino. Try: SOL, USDC, USDT, mSOL` };
  }

  try {
    const rpc = createSolanaRpc(getRpc(network));

    const market = await KaminoMarket.load(
      rpc,
      address(KAMINO_MAINNET_MARKET),
      SLOT_DURATION_MS
    );
    if (!market) return { error: "Failed to load Kamino market" };

    const owner = noopSigner(address(walletAddress));

    // Obligation must already exist — can't withdraw if never deposited
    let obligation;
    try {
      obligation = await market.getUserVanillaObligation(address(walletAddress));
    } catch {
      return { error: "No Kamino lending position found for this wallet. Nothing to withdraw." };
    }

    const decimals = tokenInfo.decimals ?? 6;
    const amountLamports = Math.floor(amount * 10 ** decimals).toString();

    const withdrawAction = await KaminoAction.buildWithdrawTxns(
      market,
      amountLamports,
      address(mintAddress),
      owner,
      obligation,
      true,       // useV2Ixs
      undefined,  // no scope refresh config
    );

    const ixs = KaminoAction.actionToIxs(withdrawAction);
    if (!ixs.length) return { error: "No instructions generated for withdrawal" };

    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    const txMessage = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayer(owner.address, tx),
      (tx) => appendTransactionMessageInstructions(ixs, tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: latestBlockhash.blockhash, lastValidBlockHeight: latestBlockhash.lastValidBlockHeight },
        tx
      )
    );

    const compiledTx = compileTransaction(txMessage);
    const serializedTx = getBase64EncodedWireTransaction(compiledTx);

    return {
      type: "transaction_preview",
      protocol: "Kamino Withdraw",
      action: `Withdraw ${amount} ${symbol} from Kamino lending`,
      serializedTx,
      estimatedOutput: `${amount} ${symbol} returned to wallet`,
      fee: "~0.000005 SOL (network fee)",
      why: `Withdraws your ${symbol} deposit plus accrued interest from Kamino lending back to your wallet.`,
      requiresApproval: true,
    };
  } catch (err) {
    console.error("[Kamino Withdraw] error:", err.message);
    return { error: `Kamino withdrawal failed: ${err.message}` };
  }
}

module.exports = {
  buildMarinadeStakeTx,    // LST (mSOL) — used by agent strategies
  buildMarinadeUnstakeTx,  // instant liquid unstake (mSOL → SOL)
  buildNativeStakeTx,      // native staking — kept for explicit requests
  buildJupiterSwapTx,
  buildKaminoLendTx,
  buildKaminoWithdrawTx,
};