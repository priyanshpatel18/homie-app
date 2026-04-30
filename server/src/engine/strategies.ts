// @ts-nocheck
/**
 * Decision Engine — pure logic, no AI.
 * Takes parsed intent and returns DeFi strategies using trusted Solana protocols.
 * APYs are fetched live from Marinade, Kamino, and Jupiter.
 */

const { fetchLiveRates } = require("../data/fetchRates");

const PROTOCOL_URLS = {
  marinade: "https://marinade.finance",
  kamino: "https://app.kamino.finance",
  jupiter: "https://jup.ag",
};

async function getStrategies(intent, walletContext = {}) {
  const rates = await fetchLiveRates();
  const { intent: action, risk_level, token } = intent;

  // Use the real wallet balance as amount when intent has none
  const solBalance = walletContext.solBalance ?? null;
  const amount = intent.amount ?? solBalance;

  switch (action) {
    case "stake":
      return buildStakeStrategies(amount, risk_level, rates);
    case "lend":
      return buildLendStrategies(amount, risk_level, token, rates);
    case "swap":
      return buildSwapStrategies(amount, intent.details);
    case "yield":
      return buildYieldStrategies(amount, risk_level, rates);
    case "balance_check":
      return buildBalanceResponse(walletContext);
    case "portfolio_check":
      return buildPortfolioResponse(walletContext);  // uses portfolio if present
    default:
      return buildDefaultResponse();
  }
}

function buildStakeStrategies(amount, risk, rates) {
  const strategies = [
    {
      protocol: "Marinade Finance",
      action: "Stake SOL → receive mSOL",
      amount,
      estimated_apy: rates.marinade_apy + "%",
      risk: "low",
      why: "mSOL stays liquid — you can use it in other DeFi protocols or sell anytime. Best of both worlds.",
      url: PROTOCOL_URLS.marinade,
    },
  ];

  if (risk === "low") {
    strategies.push({
      protocol: "Marinade Native",
      action: "Native stake SOL",
      amount,
      estimated_apy: rates.marinade_native_apy + "%",
      risk: "low",
      why: "Zero smart contract risk. Your SOL is staked directly with validators. Downside: ~2 day unstake period.",
      url: PROTOCOL_URLS.marinade,
    });
  }

  return strategies;
}

function buildLendStrategies(amount, risk, token, rates) {
  const strategies = [];

  if (token === "SOL" || token === "sol") {
    strategies.push({
      protocol: "Kamino Lend (SOL)",
      action: "Lend SOL on Kamino",
      amount,
      estimated_apy: rates.kamino_sol_lending_apy + "%",
      risk: "low",
      why: "Earn passive yield by lending your SOL to borrowers. Withdraw anytime.",
      url: PROTOCOL_URLS.kamino,
    });
  }

  const usdcAmount = amount ? `~${(amount * rates.sol_price_usd).toFixed(0)} USDC` : null;
  strategies.push({
    protocol: "Kamino Lend (USDC)",
    action: "Swap to USDC → Lend on Kamino",
    amount: usdcAmount,
    estimated_apy: rates.kamino_usdc_lending_apy + "%",
    risk: "low",
    why: "USDC lending rates are usually higher than SOL. You'd swap first, then lend. Stable value = no price risk.",
    url: PROTOCOL_URLS.kamino,
  });

  return strategies;
}

function buildSwapStrategies(amount, details) {
  return [
    {
      protocol: "Jupiter Swap",
      action: "Swap via Jupiter aggregator",
      amount,
      estimated_apy: null,
      risk: "low",
      why: "Jupiter finds the best price across all Solana DEXes. Lowest slippage guaranteed.",
      details,
      url: PROTOCOL_URLS.jupiter,
    },
  ];
}

function buildYieldStrategies(amount, risk, rates) {
  const strategies = [
    {
      protocol: "Marinade Finance",
      action: "Stake SOL → mSOL",
      amount,
      estimated_apy: rates.marinade_apy + "%",
      risk: "low",
      why: "Safest yield on Solana. Stake and forget — your mSOL grows in value automatically.",
      url: PROTOCOL_URLS.marinade,
    },
    {
      protocol: "Kamino Lend (SOL)",
      action: "Lend SOL on Kamino",
      amount,
      estimated_apy: rates.kamino_sol_lending_apy + "%",
      risk: "low",
      why: "Lower yield than staking but instantly withdrawable. Good for SOL you might need soon.",
      url: PROTOCOL_URLS.kamino,
    },
  ];

  if (risk === "medium" || risk === "high") {
    strategies.push({
      protocol: "Kamino SOL-USDC LP",
      action: "Provide liquidity to SOL-USDC pool",
      amount,
      estimated_apy: rates.kamino_sol_usdc_lp_apy + "%",
      risk: "medium",
      why: "Higher yield but you're exposed to impermanent loss if SOL price moves a lot. Worth it if you think SOL trades sideways.",
      url: PROTOCOL_URLS.kamino,
    });
  }

  return strategies;
}

function buildBalanceResponse({ walletAddress, solBalance } = {}) {
  const bal = solBalance !== null && solBalance !== undefined ? `${Number(solBalance).toFixed(4)} SOL` : "unknown";
  return [
    {
      protocol: "Homie",
      action: "Balance check",
      amount: solBalance,
      estimated_apy: null,
      risk: null,
      why: `Your wallet (${walletAddress ? walletAddress.slice(0,4) + "..." + walletAddress.slice(-4) : "?"}) holds ${bal}.`,
    },
  ];
}

function buildPortfolioResponse({ solBalance, portfolio } = {}) {
  // If we have real on-chain portfolio data, surface it as individual cards
  if (portfolio) {
    const results = [];

    // SOL balance card
    results.push({
      protocol: "Wallet",
      action: `${portfolio.solBalance.toFixed(4)} SOL`,
      amount: portfolio.solBalance,
      estimated_apy: null,
      risk: null,
      why: `Native SOL in your wallet (${portfolio.walletAddress.slice(0,4)}...${portfolio.walletAddress.slice(-4)})`,
    });

    // SPL token cards
    for (const token of portfolio.tokens) {
      results.push({
        protocol: token.name,
        action: `${token.balance.toFixed(token.decimals > 4 ? 4 : token.decimals)} ${token.symbol}`,
        amount: token.balance,
        estimated_apy: null,
        risk: null,
        why: `SPL token in your wallet`,
      });
    }

    // Protocol position cards
    for (const pos of portfolio.positions) {
      if (pos.type === "liquid_stake") {
        results.push({
          protocol: pos.protocol,
          action: pos.description,
          amount: pos.solValue,
          estimated_apy: null,
          risk: "low",
          why: `Liquid staking position — earns staking rewards while staying usable in DeFi`,
          url: "https://marinade.finance",
        });
      } else if (pos.type === "lending") {
        const depositSummary = pos.deposits.map((d) => `${d.amount.toFixed(4)} ${d.token}`).join(", ");
        const borrowSummary  = pos.borrows.map((b) => `${b.amount.toFixed(4)} ${b.token}`).join(", ");
        results.push({
          protocol: pos.protocol,
          action: depositSummary ? `Deposited: ${depositSummary}` : "Active lending position",
          amount: null,
          estimated_apy: pos.netApy ?? null,
          risk: pos.healthFactor < 1.2 ? "high" : pos.healthFactor < 1.5 ? "medium" : "low",
          why: borrowSummary
            ? `Borrowing: ${borrowSummary}. Health factor: ${pos.healthFactor?.toFixed(2) ?? "?"}`
            : `Earning yield on deposited assets`,
          url: "https://app.kamino.finance",
        });
      }
    }

    return results.length > 0 ? results : [{
      protocol: "Homie",
      action: "Empty wallet",
      amount: portfolio.solBalance,
      estimated_apy: null,
      risk: null,
      why: `Your wallet has ${portfolio.solBalance.toFixed(4)} SOL and no other tokens yet.`,
    }];
  }

  // Fallback — no portfolio data fetched yet
  const bal = solBalance !== null && solBalance !== undefined ? `${Number(solBalance).toFixed(4)} SOL` : null;
  return [{
    protocol: "Homie",
    action: "Portfolio snapshot",
    amount: solBalance,
    estimated_apy: null,
    risk: null,
    why: bal
      ? `You're holding ${bal}. Want me to find the best moves for this?`
      : "Wallet connected. Balance is loading — try again in a moment.",
  }];
}

function buildDefaultResponse() {
  return [
    {
      protocol: "Homie",
      action: "Let me help you figure this out",
      amount: null,
      estimated_apy: null,
      risk: null,
      why: "Tell me what you're trying to do with your SOL — earn yield, swap tokens, or something else — and I'll find the best move.",
    },
  ];
}

module.exports = { getStrategies };