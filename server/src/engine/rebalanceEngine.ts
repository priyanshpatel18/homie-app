// @ts-nocheck
/**
 * rebalanceEngine.js — compute what moves are needed to bring a portfolio
 * back to a target allocation.
 *
 * Buckets:
 *   liquid  — SOL + non-DeFi tokens (idle cash)
 *   staked  — mSOL (Marinade liquid staking)
 *   lending — kTokens (Kamino lending)
 *
 * Returns a rebalance plan with ordered actions the agent can present
 * as strategy cards. Keeps actions minimal — only moves that close
 * >$5 gaps (skip tiny rebalances that cost more in fees than they earn).
 */

const MIN_ACTION_USD  = 10;  // don't bother for < $10 moves
const MIN_SOL_RESERVE = 0.02; // always keep this much SOL for fees

// ─── Allocation calculation ───────────────────────────────────────────────────

function computeBuckets(portfolio, solPrice) {
  const solBalance = portfolio.solBalance ?? 0;
  const tokens     = portfolio.tokens ?? [];

  // Staked: mSOL (Marinade). mSOL ≈ SOL in USD value.
  const mSolBalance = tokens.find((t) => t.symbol === "mSOL")?.balance ?? 0;
  const stakedUsd   = mSolBalance * solPrice;

  // Lending: kUSDC, kSOL, kUSDT etc. (Kamino deposit tokens).
  // These carry a stored usdValue from the RPC response.
  const lendingUsd = tokens
    .filter((t) => t.symbol?.startsWith("k") && t.symbol !== "kSOL")
    .reduce((s, t) => s + (t.usdValue ?? 0), 0);

  // Liquid: raw SOL + all non-DeFi SPL tokens
  const tokenLiquidUsd = tokens
    .filter((t) => t.symbol !== "mSOL" && !t.symbol?.startsWith("k"))
    .reduce((s, t) => s + (t.usdValue ?? 0), 0);
  const liquidUsd = solBalance * solPrice + tokenLiquidUsd;

  const totalUsd = stakedUsd + lendingUsd + liquidUsd;

  return {
    totalUsd,
    liquidUsd, stakedUsd, lendingUsd,
    solBalance,
    solLiquidUsd: solBalance * solPrice,
    usdcBalance:  tokens.find((t) => t.symbol === "USDC")?.balance ?? 0,
    pct: totalUsd > 0 ? {
      liquid:  Math.round((liquidUsd  / totalUsd) * 100),
      staked:  Math.round((stakedUsd  / totalUsd) * 100),
      lending: Math.round((lendingUsd / totalUsd) * 100),
    } : { liquid: 100, staked: 0, lending: 0 },
  };
}

// ─── Plan builder ─────────────────────────────────────────────────────────────

/**
 * @param {Object} portfolio   — from fetchPortfolio()
 * @param {number} solPrice    — current SOL/USD price
 * @param {Object} targets     — { liquid, staked, lending } (percentages summing to 100)
 * @param {number} threshold   — minimum drift % before flagging as needed (default 8)
 * @returns {Object}           — { needsRebalance, summary, current, targets, actions[], totalUsd }
 */
function computeRebalancePlan(portfolio, solPrice, targets, threshold = 8) {
  const current = computeBuckets(portfolio, solPrice);
  const { totalUsd, liquidUsd, stakedUsd, lendingUsd, solBalance, usdcBalance, pct } = current;

  if (totalUsd < 20) {
    return {
      needsRebalance: false,
      reason: "Portfolio value is too small to rebalance meaningfully (< $20).",
      current: pct, targets, actions: [], totalUsd,
    };
  }

  // USD targets
  const tStakedUsd  = (targets.staked  / 100) * totalUsd;
  const tLendingUsd = (targets.lending / 100) * totalUsd;
  const tLiquidUsd  = (targets.liquid  / 100) * totalUsd;

  // Gaps (positive = need more, negative = need less)
  const stakeDelta  = tStakedUsd  - stakedUsd;
  const lendDelta   = tLendingUsd - lendingUsd;

  // Max drift across all buckets
  const maxDrift = Math.max(
    Math.abs(pct.liquid  - targets.liquid),
    Math.abs(pct.staked  - targets.staked),
    Math.abs(pct.lending - targets.lending),
  );

  if (maxDrift < threshold) {
    return {
      needsRebalance: false,
      reason: `Portfolio is within ${threshold}% of target across all buckets (max drift: ${maxDrift}%). Looking good — no action needed.`,
      current: pct, targets, maxDrift, actions: [], totalUsd,
    };
  }

  const actions = [];

  // ── 1. Staking ────────────────────────────────────────────────────────────
  if (stakeDelta >= MIN_ACTION_USD) {
    // Need more staked — use liquid SOL
    const solToStake = Math.min(
      stakeDelta / solPrice,
      solBalance - MIN_SOL_RESERVE,
    );
    if (solToStake > 0.005) {
      actions.push({
        priority:    actions.length === 0 ? "primary" : "secondary",
        action:      "stake",
        protocol:    "Marinade Finance",
        pair:        "mSOL",
        amountSol:   +solToStake.toFixed(4),
        amountUsd:   +(solToStake * solPrice).toFixed(2),
        apy:         7.2,
        risk:        "low",
        description: `Stake ${solToStake.toFixed(3)} SOL → mSOL. Moves staked from ${pct.staked}% → ~${targets.staked}% and earns 7.2% APY. Marinade has $1B+ TVL and 3 years without an exploit.`,
      });
    }
  } else if (stakeDelta <= -MIN_ACTION_USD && stakedUsd > 0) {
    // Overstaked — suggest unstaking
    const solToUnstake = Math.min(Math.abs(stakeDelta) / solPrice, current.mSolBalance ?? 0);
    if (solToUnstake > 0.005) {
      actions.push({
        priority:    actions.length === 0 ? "primary" : "secondary",
        action:      "unstake",
        protocol:    "Marinade Finance",
        pair:        "mSOL",
        amountSol:   +solToUnstake.toFixed(4),
        amountUsd:   +(solToUnstake * solPrice).toFixed(2),
        apy:         0,
        risk:        "low",
        description: `Unstake ${solToUnstake.toFixed(3)} mSOL → SOL (instant, ~0.3% fee). Brings staked from ${pct.staked}% down to ~${targets.staked}% and frees up liquidity.`,
      });
    }
  }

  // ── 2. Lending ────────────────────────────────────────────────────────────
  if (lendDelta >= MIN_ACTION_USD) {
    const usdToLend = Math.min(lendDelta, liquidUsd * 0.85);

    if (usdcBalance * 1 >= usdToLend * 0.9) {
      // Already have enough USDC — just lend it
      actions.push({
        priority:    actions.length === 0 ? "primary" : "secondary",
        action:      "lend",
        protocol:    "Kamino Finance",
        pair:        "USDC Lending",
        amountSol:   0,
        amountUsd:   +usdToLend.toFixed(2),
        apy:         9.0,
        risk:        "low",
        description: `Lend $${usdToLend.toFixed(0)} USDC on Kamino. Moves lending from ${pct.lending}% → ~${targets.lending}% and earns 8-10% APY. USDC lending on Kamino is one of the lowest-risk yield moves on Solana.`,
      });
    } else {
      // Need to swap SOL to USDC first, then lend
      const solNeeded   = usdToLend / solPrice;
      const solAvailable = Math.max(0, solBalance - MIN_SOL_RESERVE - (actions.find(a => a.action === "stake")?.amountSol ?? 0));

      if (solAvailable > 0.01) {
        const solToSwap = Math.min(solNeeded, solAvailable);
        const swapUsd   = solToSwap * solPrice;

        actions.push({
          priority:    "secondary",
          action:      "swap",
          protocol:    "Jupiter",
          pair:        "SOL→USDC",
          amountSol:   +solToSwap.toFixed(4),
          amountUsd:   +swapUsd.toFixed(2),
          apy:         0,
          risk:        "low",
          description: `Swap ${solToSwap.toFixed(3)} SOL → USDC via Jupiter. You need USDC to fund your lending allocation — best route, minimal slippage.`,
        });
        actions.push({
          priority:    actions.length <= 1 ? "primary" : "secondary",
          action:      "lend",
          protocol:    "Kamino Finance",
          pair:        "USDC Lending",
          amountSol:   0,
          amountUsd:   +swapUsd.toFixed(2),
          apy:         9.0,
          risk:        "low",
          description: `Lend $${swapUsd.toFixed(0)} USDC on Kamino — earns 8-10% APY and brings lending allocation from ${pct.lending}% → ~${targets.lending}%.`,
        });
      }
    }
  } else if (lendDelta <= -MIN_ACTION_USD && lendingUsd > 0) {
    // Over-lent — suggest withdrawing
    const usdToWithdraw = Math.min(Math.abs(lendDelta), lendingUsd);
    actions.push({
      priority:    actions.length === 0 ? "primary" : "secondary",
      action:      "withdraw",
      protocol:    "Kamino Finance",
      pair:        "USDC Lending",
      amountSol:   0,
      amountUsd:   +usdToWithdraw.toFixed(2),
      apy:         0,
      risk:        "low",
      description: `Withdraw $${usdToWithdraw.toFixed(0)} from Kamino lending. Brings lending from ${pct.lending}% down to ~${targets.lending}% and restores liquidity.`,
    });
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const bucketLines = [
    `liquid ${pct.liquid}% → ${targets.liquid}%`,
    `staked ${pct.staked}% → ${targets.staked}%`,
    `lending ${pct.lending}% → ${targets.lending}%`,
  ].join(", ");

  const summary = actions.length > 0
    ? `Portfolio is ${maxDrift}% off target (${bucketLines}). ${actions.length} move${actions.length !== 1 ? "s" : ""} needed.`
    : `Portfolio is ${maxDrift}% off target but no actionable moves are available right now (check SOL balance for fees).`;

  return {
    needsRebalance: true,
    maxDrift,
    summary,
    totalUsd:       +totalUsd.toFixed(2),
    solPrice,
    current:        pct,
    targets,
    actions,
  };
}

module.exports = { computeRebalancePlan, computeBuckets };