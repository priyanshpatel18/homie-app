// @ts-nocheck
/**
 * kaminoLeverageBuilder.js — Kamino Multiply (Leverage) vault builder.
 *
 * Supports:
 *   buildKaminoOpenLeverageTx  — open a leveraged position (deposit + borrow loop)
 *   buildKaminoCloseLeverageTx — close/reduce a leveraged position
 *   fetchLeverageVaults        — list available multiply vaults with live APY
 *
 * Architecture: Flash borrow collateral → swap debt→coll → deposit+borrow → repay flash.
 * All in ONE atomic transaction. SDK-only — not available via API.
 *
 * Quoter: Jupiter Price API  (get priceAInB)
 * Swapper: Jupiter swap-instructions endpoint → @solana/kit v2 instruction format
 */

const {
  KaminoMarket,
  getDepositWithLeverageIxs,
  getWithdrawWithLeverageIxs,
  MultiplyObligation,
  PROGRAM_ID: KAMINO_PROGRAM_ID,
} = require("@kamino-finance/klend-sdk");

const { noopSigner } = require("@kamino-finance/klend-sdk/dist/utils/signer");

const {
  fromLegacyInstruction,
  fromLegacyLookupTable,
} = require("@kamino-finance/kswap-sdk");

const {
  createSolanaRpc,
  address,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  appendTransactionMessageInstruction,
  compileTransaction,
  getBase64EncodedWireTransaction,
  setTransactionMessageAddressTableLookups,
} = require("@solana/kit");

const { PublicKey, Connection, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const Decimal = require("decimal.js");
const { loadTokenRegistry, getToken } = require("../data/tokenRegistry");

const RPC_URLS = {
  mainnet: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
  devnet:  "https://api.devnet.solana.com",
};

const JUP_SWAP_BASE  = "https://api.jup.ag/swap/v1";
const JUP_PRICE_BASE = "https://api.jup.ag/price/v2";
const KAMINO_MARKET  = "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF";
const RESOURCES_URL  = "https://cdn.kamino.finance/resources.json";
const SLOT_DURATION  = 460;

const JUP_API_KEY = process.env.JUP_API_KEY || "";

function jupHeaders() {
  const h = { "Content-Type": "application/json", Accept: "application/json" };
  if (JUP_API_KEY) h["Authorization"] = `Bearer ${JUP_API_KEY}`;
  return h;
}

function getRpcUrl(network = "mainnet") {
  return RPC_URLS[network] ?? RPC_URLS.mainnet;
}

// Known multiply pairs: collToken → debtToken
const MULTIPLY_PAIRS = {
  "mSOL-SOL":     { collSymbol: "mSOL", debtSymbol: "SOL",  collMint: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So", debtMint: "So11111111111111111111111111111111111111112" },
  "JitoSOL-SOL":  { collSymbol: "JitoSOL", debtSymbol: "SOL", collMint: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn", debtMint: "So11111111111111111111111111111111111111112" },
  "SOL-USDC":     { collSymbol: "SOL", debtSymbol: "USDC",  collMint: "So11111111111111111111111111111111111111112", debtMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
  "bSOL-SOL":     { collSymbol: "bSOL", debtSymbol: "SOL",  collMint: "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1", debtMint: "So11111111111111111111111111111111111111112" },
};

// ─── LUT cache ────────────────────────────────────────────────────────────────

let resourcesCache = null;
let resourcesCacheAt = 0;

async function fetchResources() {
  if (resourcesCache && Date.now() - resourcesCacheAt < 10 * 60_000) return resourcesCache;
  const res = await fetch(RESOURCES_URL, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`resources.json fetch failed: ${res.status}`);
  resourcesCache = await res.json();
  resourcesCacheAt = Date.now();
  return resourcesCache;
}

async function getMultiplyLutAddresses(collMint) {
  try {
    const resources = await fetchResources();
    const luts = resources["mainnet-beta"]?.multiplyLUTs ?? {};
    return (luts[collMint] ?? []);
  } catch {
    return [];
  }
}

// ─── Fetch LUT accounts from RPC ─────────────────────────────────────────────

async function fetchLutAccounts(rpc, lutAddresses) {
  const results = [];
  for (const addrStr of lutAddresses) {
    try {
      const { value } = await rpc.getAddressLookupTable(address(addrStr)).send();
      if (value) {
        results.push(fromLegacyLookupTable(value));
      }
    } catch { /* skip unavailable LUTs */ }
  }
  return results;
}

// ─── Jupiter price fetcher ────────────────────────────────────────────────────

async function fetchJupiterPrice(mintAddress) {
  const res = await fetch(`${JUP_PRICE_BASE}?ids=${mintAddress}`, {
    headers: jupHeaders(),
    signal: AbortSignal.timeout(6_000),
  });
  if (!res.ok) throw new Error(`Jupiter price fetch failed: ${res.status}`);
  const data = await res.json();
  const price = parseFloat(data?.data?.[mintAddress]?.price);
  if (!isFinite(price)) throw new Error(`No price for ${mintAddress}`);
  return price;
}

// ─── Build quoter function ────────────────────────────────────────────────────
// Quoter interface: (swapInputsForQuote, klendAccounts) => { priceAInB, quoteResponse }

function buildQuoter() {
  return async function quoter(swapInputsForQuote) {
    const { inputAmountLamports, inputMint, outputMint } = swapInputsForQuote;
    const inMintStr  = inputMint.toString();
    const outMintStr = outputMint.toString();

    // Get both prices to compute cross-price
    const [inPrice, outPrice] = await Promise.all([
      fetchJupiterPrice(inMintStr),
      fetchJupiterPrice(outMintStr),
    ]);

    const priceAInB = new Decimal(inPrice).div(new Decimal(outPrice));

    // Also get a real quote for the swap amount (for minOutAmount calcs)
    const amountStr = inputAmountLamports.toFixed(0);
    const quoteUrl = new URL(`${JUP_SWAP_BASE}/quote`);
    quoteUrl.searchParams.set("inputMint", inMintStr);
    quoteUrl.searchParams.set("outputMint", outMintStr);
    quoteUrl.searchParams.set("amount", amountStr);
    quoteUrl.searchParams.set("slippageBps", "50");

    const quoteRes = await fetch(quoteUrl.toString(), {
      headers: jupHeaders(),
      signal: AbortSignal.timeout(10_000),
    });

    let quoteResponse = null;
    if (quoteRes.ok) {
      quoteResponse = await quoteRes.json();
    }

    return {
      priceAInB,
      quoteResponse,
      inPrice,
      outPrice,
    };
  };
}

// ─── Build swapper function ───────────────────────────────────────────────────
// Swapper interface: (swapInputs, klendAccounts, swapQuote) => [{ swapIxs, lookupTables, quote }]

function buildSwapper(rpc) {
  return async function swapper(swapInputs, _klendAccounts, swapQuote) {
    const { inputAmountLamports, minOutAmountLamports, inputMint, outputMint } = swapInputs;
    const inMintStr  = inputMint.toString();
    const outMintStr = outputMint.toString();

    // Get Jupiter quote
    const amountStr = inputAmountLamports.toFixed(0);
    const quoteUrl = new URL(`${JUP_SWAP_BASE}/quote`);
    quoteUrl.searchParams.set("inputMint", inMintStr);
    quoteUrl.searchParams.set("outputMint", outMintStr);
    quoteUrl.searchParams.set("amount", amountStr);
    quoteUrl.searchParams.set("slippageBps", "100"); // slightly more for leverage tx

    const quoteRes = await fetch(quoteUrl.toString(), {
      headers: jupHeaders(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!quoteRes.ok) throw new Error(`Jupiter quote failed: ${await quoteRes.text()}`);
    const quoteResponse = await quoteRes.json();

    // Get swap instructions (raw format, not compiled tx)
    const ixRes = await fetch(`${JUP_SWAP_BASE}/swap-instructions`, {
      method: "POST",
      headers: jupHeaders(),
      body: JSON.stringify({
        quoteResponse,
        userPublicKey: _klendAccounts?.size > 0
          ? undefined  // will be overridden by leverage IXs
          : undefined,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: false, // leverage tx manages compute budget itself
        skipUserAccountsRpcCalls: false,
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!ixRes.ok) throw new Error(`Jupiter swap-instructions failed: ${await ixRes.text()}`);
    const ixData = await ixRes.json();

    // Convert Jupiter's raw instruction format to @solana/kit v2 instructions
    function convertRawIx(raw) {
      if (!raw) return null;
      const ixLike = {
        programId: new PublicKey(raw.programId),
        keys: raw.accounts.map((a) => ({
          pubkey: new PublicKey(a.pubkey),
          isSigner: a.isSigner,
          isWritable: a.isWritable,
        })),
        data: Buffer.from(raw.data, "base64"),
      };
      return fromLegacyInstruction(ixLike);
    }

    const swapIxs = [
      ...(ixData.setupInstructions ?? []).map(convertRawIx).filter(Boolean),
      ...(ixData.swapInstruction ? [convertRawIx(ixData.swapInstruction)] : []),
      ...(ixData.cleanupInstruction ? [convertRawIx(ixData.cleanupInstruction)] : []),
    ];

    // Fetch LUTs from Jupiter's response
    const lutAddrs = ixData.addressLookupTableAddresses ?? [];
    const lookupTables = await fetchLutAccounts(rpc, lutAddrs);

    return [{
      swapIxs,
      lookupTables,
      quote: { quoteResponse },
    }];
  };
}

// ─── Get latest blockhash ─────────────────────────────────────────────────────

async function getLatestBlockhash(rpc) {
  const { value } = await rpc.getLatestBlockhash().send();
  return value;
}

// ─── Get current slot ─────────────────────────────────────────────────────────

async function getCurrentSlot(rpc) {
  return rpc.getSlot().send();
}

// ─── 1. Open leverage position ────────────────────────────────────────────────

async function buildKaminoOpenLeverageTx({
  collToken,        // e.g. "mSOL" or "SOL"
  debtToken,        // e.g. "SOL" or "USDC"
  depositAmount,    // amount of collToken to deposit initially
  targetLeverage,   // e.g. 2.0 for 2× leverage, 3.0 for 3×
  walletAddress,
  network = "mainnet",
}) {
  if (network === "devnet") {
    return { error: "Kamino leverage is mainnet only." };
  }
  if (targetLeverage < 1.1 || targetLeverage > 10) {
    return { error: "Leverage must be between 1.1× and 10×." };
  }

  const rpc = createSolanaRpc(getRpcUrl(network));

  // Resolve token mints
  await loadTokenRegistry();
  const collTok = getToken(collToken) ?? { address: collToken, decimals: 9 };
  const debtTok = getToken(debtToken) ?? { address: debtToken, decimals: 9 };
  const collMintStr = collTok.address;
  const debtMintStr = debtTok.address;

  // Load Kamino market
  const market = await KaminoMarket.load(
    rpc,
    new PublicKey(KAMINO_MARKET),
    SLOT_DURATION,
    KAMINO_PROGRAM_ID,
  );
  if (!market) throw new Error("Kamino market failed to load");

  // Create noop-signer owner (Privy wallet signs the final tx)
  const ownerAddr = address(walletAddress);
  const owner = noopSigner(ownerAddr);

  // Build MultiplyObligation (the PDA that tracks leverage positions)
  const obligation = new MultiplyObligation(
    address(collMintStr),
    address(debtMintStr),
    address(KAMINO_PROGRAM_ID.toString()),
  );

  // Get current price ratios
  const [collPrice, debtPrice] = await Promise.all([
    fetchJupiterPrice(collMintStr),
    fetchJupiterPrice(debtMintStr),
  ]);
  const priceDebtToColl = new Decimal(debtPrice).div(new Decimal(collPrice));

  const [currentSlot] = await Promise.all([getCurrentSlot(rpc)]);

  const quoter  = buildQuoter();
  const swapper = buildSwapper(rpc);

  // Build leverage deposit instructions
  const results = await getDepositWithLeverageIxs({
    owner,
    kaminoMarket:    market,
    debtTokenMint:   address(debtMintStr),
    collTokenMint:   address(collMintStr),
    depositAmount:   new Decimal(depositAmount),
    priceDebtToColl,
    slippagePct:     new Decimal(0.5),
    obligation,
    referrer:        null,
    currentSlot,
    targetLeverage:  new Decimal(targetLeverage),
    selectedTokenMint: address(collMintStr), // depositing collateral token
    budgetAndPriorityFeeIxs: [],
    scopeRefreshIx:  [],
    quoteBufferBps:  new Decimal(100),
    quoter,
    swapper,
    useV2Ixs:        true,
  });

  if (!results?.length) throw new Error("getDepositWithLeverageIxs returned no results");

  const { ixs, lookupTables: swapLuts } = results[0];

  // Fetch multiply LUTs from resources.json
  const multiplyLutAddrs = await getMultiplyLutAddresses(collMintStr);
  const multiplyLuts     = await fetchLutAccounts(rpc, multiplyLutAddrs);

  const allLuts = [...(swapLuts ?? []), ...multiplyLuts];

  // Compile transaction
  const blockhash = await getLatestBlockhash(rpc);

  let txMsg = await pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(ownerAddr, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(
      { blockhash: blockhash.blockhash, lastValidBlockHeight: blockhash.lastValidBlockHeight },
      m,
    ),
    (m) => appendTransactionMessageInstructions(ixs, m),
  );

  // Apply address lookup tables if present
  if (allLuts.length > 0) {
    txMsg = setTransactionMessageAddressTableLookups(
      allLuts.map((lut) => ({ tableLookup: lut })),
      txMsg,
    );
  }

  const tx = compileTransaction(txMsg);
  const serializedTx = getBase64EncodedWireTransaction(tx);

  const collSym = collToken.toUpperCase();
  const debtSym = debtToken.toUpperCase();
  const estimatedExposure = (depositAmount * targetLeverage).toFixed(4);

  return {
    type: "transaction_preview",
    protocol: "Kamino Multiply (Leverage)",
    action: `Open ${targetLeverage}× leveraged ${collSym} position`,
    serializedTx,
    estimatedOutput: `~${estimatedExposure} ${collSym} exposure on ${depositAmount} ${collSym} deposit`,
    fee: `Kamino flash loan fee (~0.01%) + swap fee`,
    requiresApproval: true,
    details: {
      collToken: collSym, debtToken: debtSym,
      depositAmount, targetLeverage,
      collPrice, debtPrice,
    },
  };
}

// ─── 2. Close (reduce) leverage position ──────────────────────────────────────

async function buildKaminoCloseLeverageTx({
  collToken,
  debtToken,
  walletAddress,
  withdrawPct = 100,   // % of position to close (100 = full close)
  network = "mainnet",
}) {
  if (network === "devnet") {
    return { error: "Kamino leverage is mainnet only." };
  }

  const rpc = createSolanaRpc(getRpcUrl(network));
  await loadTokenRegistry();

  const collTok    = getToken(collToken) ?? { address: collToken, decimals: 9 };
  const debtTok    = getToken(debtToken) ?? { address: debtToken, decimals: 9 };
  const collMintStr = collTok.address;
  const debtMintStr = debtTok.address;

  const market = await KaminoMarket.load(
    rpc,
    new PublicKey(KAMINO_MARKET),
    SLOT_DURATION,
    KAMINO_PROGRAM_ID,
  );
  if (!market) throw new Error("Kamino market failed to load");

  const ownerAddr = address(walletAddress);
  const owner     = noopSigner(ownerAddr);

  const obligation = new MultiplyObligation(
    address(collMintStr),
    address(debtMintStr),
    address(KAMINO_PROGRAM_ID.toString()),
  );

  const [collPrice, debtPrice] = await Promise.all([
    fetchJupiterPrice(collMintStr),
    fetchJupiterPrice(debtMintStr),
  ]);
  const priceCollToDebt = new Decimal(collPrice).div(new Decimal(debtPrice));

  const currentSlot = await getCurrentSlot(rpc);

  // Fetch current obligation stats to get deposited/borrowed amounts
  let deposited = new Decimal(0);
  let borrowed  = new Decimal(0);
  try {
    const obligationPda = await obligation.toPda(new PublicKey(KAMINO_MARKET), new PublicKey(walletAddress));
    const oblig = await market.getObligationByAddress(new PublicKey(obligationPda.toString()));
    if (oblig) {
      deposited = new Decimal(oblig.refreshedStats.userTotalDeposit.toString());
      borrowed  = new Decimal(oblig.refreshedStats.userTotalBorrow.toString());
    }
  } catch { /* will use defaults */ }

  const quoter  = buildQuoter();
  const swapper = buildSwapper(rpc);

  const isClosing   = withdrawPct >= 100;
  const withdrawAmt = isClosing ? null : deposited.mul(withdrawPct / 100);

  const results = await getWithdrawWithLeverageIxs({
    owner,
    kaminoMarket:         market,
    debtTokenMint:        address(debtMintStr),
    collTokenMint:        address(collMintStr),
    obligation,
    deposited,
    borrowed,
    referrer:             null,
    currentSlot,
    withdrawAmount:       withdrawAmt ?? deposited,
    priceCollToDebt,
    slippagePct:          new Decimal(0.5),
    isClosingPosition:    isClosing,
    selectedTokenMint:    address(collMintStr),
    budgetAndPriorityFeeIxs: [],
    scopeRefreshIx:       [],
    quoteBufferBps:       new Decimal(100),
    quoter,
    swapper,
    useV2Ixs:             true,
    userSolBalanceLamports: BigInt(0.1 * LAMPORTS_PER_SOL),
  });

  if (!results?.length) throw new Error("getWithdrawWithLeverageIxs returned no results");

  const { ixs, lookupTables: swapLuts } = results[0];

  const multiplyLutAddrs = await getMultiplyLutAddresses(collMintStr);
  const multiplyLuts     = await fetchLutAccounts(rpc, multiplyLutAddrs);
  const allLuts          = [...(swapLuts ?? []), ...multiplyLuts];

  const blockhash = await getLatestBlockhash(rpc);
  let txMsg = await pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(ownerAddr, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(
      { blockhash: blockhash.blockhash, lastValidBlockHeight: blockhash.lastValidBlockHeight },
      m,
    ),
    (m) => appendTransactionMessageInstructions(ixs, m),
  );

  if (allLuts.length > 0) {
    txMsg = setTransactionMessageAddressTableLookups(
      allLuts.map((lut) => ({ tableLookup: lut })),
      txMsg,
    );
  }

  const tx = compileTransaction(txMsg);
  const serializedTx = getBase64EncodedWireTransaction(tx);

  const collSym = collToken.toUpperCase();
  return {
    type: "transaction_preview",
    protocol: "Kamino Multiply (Leverage)",
    action: isClosing ? `Close leveraged ${collSym} position` : `Reduce position by ${withdrawPct}%`,
    serializedTx,
    estimatedOutput: isClosing
      ? `All ${collSym} collateral returned, all debt repaid`
      : `${withdrawPct}% of collateral returned`,
    fee: "Kamino flash loan fee (~0.01%) + swap fee",
    requiresApproval: true,
  };
}

// ─── 3. List available multiply vaults ────────────────────────────────────────

async function fetchLeverageVaults() {
  try {
    const resources = await fetchResources();
    const multiplyFeatured = resources["mainnet-beta"]?.multiplyFeatured ?? [];
    const multiplyAll      = resources["mainnet-beta"]?.multiply ?? {};

    const vaults = Object.entries(multiplyAll)
      .filter(([, v]) => !v?.deprecated)
      .map(([strategy, v]) => ({
        strategy,
        collToken: v?.collToken ?? v?.token ?? "?",
        debtToken: v?.debtToken ?? "SOL",
        maxLeverage: v?.maxLeverage ?? 5,
        apy: v?.apy ?? null,
        tvl: v?.tvl ?? null,
      }))
      .slice(0, 20);

    return { count: vaults.length, featured: multiplyFeatured, vaults };
  } catch (err) {
    // Fallback to hardcoded common pairs
    return {
      count: Object.keys(MULTIPLY_PAIRS).length,
      featured: Object.keys(MULTIPLY_PAIRS),
      vaults: Object.entries(MULTIPLY_PAIRS).map(([pair, info]) => ({
        pair,
        collToken: info.collSymbol,
        debtToken: info.debtSymbol,
        maxLeverage: 5,
        description: `Multiply ${info.collSymbol} yield by borrowing ${info.debtSymbol}`,
      })),
    };
  }
}

module.exports = {
  buildKaminoOpenLeverageTx,
  buildKaminoCloseLeverageTx,
  fetchLeverageVaults,
};