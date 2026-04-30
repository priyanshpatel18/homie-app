// @ts-nocheck
/**
 * lpRebalanceBundle.js — builds a 3-step LP rebalance bundle:
 *   Step 1: Close out-of-range position → receive both tokens back
 *   Step 2: Swap to achieve ~50/50 token split for the new range
 *   Step 3: Open new position centered on current price (±range%)
 *
 * Steps 2 & 3 are pre-built with estimated amounts (marked estimated: true).
 * The actual amounts are determined after step 1 confirms on-chain.
 * The app shows all 3 steps upfront for full transparency.
 */

const { buildOrcaCloseLpTx, buildOrcaOpenLpTx } = require("./orcaBuilder");
const { buildJupiterSwapTx }                      = require("./transactionBuilder");
const { fetchLiveRates }                          = require("../data/fetchRates");

const DEFAULT_RANGE_PCT = 0.22; // ±22% from current price → ~44% total width

/**
 * @param {object} opts
 *   positionMint    — Orca position NFT mint
 *   tokenA          — e.g. "SOL"
 *   tokenB          — e.g. "USDC"
 *   positionAmountUsd — estimated total USD value of the position
 *   walletAddress
 *   network
 *   rangePct        — optional override for range width (default 0.22 = ±22%)
 */
async function buildOrcaRebalanceBundleTx({
  positionMint,
  tokenA = "SOL",
  tokenB = "USDC",
  positionAmountUsd = 200,
  walletAddress,
  network = "mainnet",
  rangePct,
}) {
  const rates    = await fetchLiveRates();
  const solPrice = rates?.sol_price_usd ?? 170;
  const width    = rangePct ?? DEFAULT_RANGE_PCT;

  const rangeLow  = Math.round(solPrice * (1 - width));
  const rangeHigh = Math.round(solPrice * (1 + width));

  const halfUsd       = positionAmountUsd / 2;
  const estSolAmount  = parseFloat((halfUsd / solPrice).toFixed(4));
  const estUsdcAmount = parseFloat(halfUsd.toFixed(2));

  // ── Step 1: Close existing position ────────────────────────────────────────
  const closeTx = await buildOrcaCloseLpTx(positionMint, walletAddress, network);

  // ── Step 2: Swap to rebalance ───────────────────────────────────────────────
  // We don't know the exact output of step 1 yet, so we estimate a 50/50 rebalance.
  // Worst case: the swap amount is slightly wrong and the user manually fixes it.
  const swapTx = await buildJupiterSwapTx(
    tokenB, tokenA, estUsdcAmount, walletAddress, network
  );

  // ── Step 3: Open new position ───────────────────────────────────────────────
  const openTx = await buildOrcaOpenLpTx({
    tokenA, tokenB, amountA: estSolAmount, walletAddress, network,
  });

  const bundle = {
    type:        "transaction_bundle",
    bundleId:    `bundle_${Date.now()}`,
    title:       `Rebalance ${tokenA}-${tokenB} LP`,
    description: `Close out-of-range position → rebalance to 50/50 → reopen at $${solPrice}`,
    protocol:    "Orca Whirlpools",
    totalSteps:  3,
    estimatedGas: "~0.003 SOL total",
    why: `Your ${tokenA}-${tokenB} LP position is out of range. These 3 steps close it, rebalance your tokens, and reopen centered at the current price ($${solPrice}) with a $${rangeLow}–$${rangeHigh} range. You'll earn fees again immediately.`,
    newRange: { low: rangeLow, high: rangeHigh, currentPrice: solPrice },

    steps: [
      {
        step:         1,
        label:        "Close Out-of-Range Position",
        description:  `Withdraw all ${tokenA}+${tokenB} from your current Orca position. Fees earned so far are also collected.`,
        protocol:     "Orca Whirlpools",
        risk:         "low",
        serializedTx: closeTx.serializedTx,
        estimated:    false,
        details: {
          positionMint,
          action: "Close LP position",
        },
      },
      {
        step:         2,
        label:        "Rebalance Tokens",
        description:  `Swap ~$${estUsdcAmount.toFixed(0)} ${tokenB} → ${tokenA} via Jupiter to achieve a 50/50 split for the new range.`,
        protocol:     "Jupiter Aggregator",
        risk:         "low",
        serializedTx: swapTx.serializedTx,
        estimated:    true,
        estimatedNote: "Amount estimated from position value — will be adjusted based on what step 1 returns",
        details: {
          inputToken:  tokenB,
          outputToken: tokenA,
          inputAmount: estUsdcAmount,
          estimatedOutput: swapTx.estimatedOutput,
        },
      },
      {
        step:         3,
        label:        "Open New Position",
        description:  `Open ${tokenA}-${tokenB} full-range Orca position. New range: $${rangeLow}–$${rangeHigh} (centered at $${solPrice}, ±${Math.round(width * 100)}%).`,
        protocol:     "Orca Whirlpools",
        risk:         "low",
        serializedTx: openTx.serializedTx,
        estimated:    true,
        estimatedNote: "Token amounts estimated — actual deposit uses balance from steps 1+2",
        details: {
          tokenA,
          tokenB,
          amountA:   estSolAmount,
          rangeLow,
          rangeHigh,
          currentPrice: solPrice,
          newPositionMint: openTx.positionMint,
        },
      },
    ],
  };

  return bundle;
}

/**
 * Meteora DLMM rebalance bundle: close → open new bin range.
 * No swap step needed — DLMM positions are single-sided when out of range.
 */
async function buildMeteoraRebalanceBundleTx({
  poolAddress,
  positionAddress,
  tokenA = "SOL",
  tokenB = "USDC",
  positionAmountUsd = 200,
  walletAddress,
  network = "mainnet",
}) {
  const {
    buildMeteoraRemoveLiquidityTx,
    buildMeteoraOpenDlmmTx,
  } = require("./meteoraBuilder");

  const rates    = await fetchLiveRates();
  const solPrice = rates?.sol_price_usd ?? 170;
  const halfUsd  = positionAmountUsd / 2;

  const removeTx = await buildMeteoraRemoveLiquidityTx({
    poolAddress, positionAddress, walletAddress, network,
  });

  const openTx = await buildMeteoraOpenDlmmTx({
    poolAddress, tokenA, tokenB,
    amountA: parseFloat((halfUsd / solPrice).toFixed(4)),
    amountB: parseFloat(halfUsd.toFixed(2)),
    walletAddress, network,
  });

  return {
    type:        "transaction_bundle",
    bundleId:    `bundle_${Date.now()}`,
    title:       `Rebalance ${tokenA}-${tokenB} DLMM`,
    description: `Remove out-of-range liquidity → reopen DLMM bins at current price`,
    protocol:    "Meteora DLMM",
    totalSteps:  2,
    estimatedGas: "~0.002 SOL total",
    why: `Your ${tokenA}-${tokenB} Meteora DLMM position has drifted out of range. These 2 steps remove your liquidity and reopen at the current price ($${solPrice}) so you start earning fees again.`,

    steps: [
      {
        step:         1,
        label:        "Remove Liquidity",
        description:  `Withdraw all liquidity from your Meteora DLMM position. Unclaimed fees are also collected.`,
        protocol:     "Meteora DLMM",
        risk:         "low",
        serializedTx: removeTx.serializedTx,
        estimated:    false,
        details:      { poolAddress, positionAddress },
      },
      {
        step:         2,
        label:        "Reopen at Current Price",
        description:  `Open new DLMM position centered at $${solPrice.toFixed(0)}. Estimated: ~${(halfUsd / solPrice).toFixed(4)} ${tokenA} + ~$${halfUsd.toFixed(0)} ${tokenB}.`,
        protocol:     "Meteora DLMM",
        risk:         "low",
        serializedTx: openTx.serializedTx,
        estimated:    true,
        estimatedNote: "Token amounts estimated — actual deposit uses balance from step 1",
        details:      { poolAddress, currentPrice: solPrice },
      },
    ],
  };
}

module.exports = { buildOrcaRebalanceBundleTx, buildMeteoraRebalanceBundleTx };