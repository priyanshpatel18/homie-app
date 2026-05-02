// @ts-nocheck
/**
 * Agentic loop with tool calling + conversation memory.
 * The LLM decides which tools to invoke, sees results, and decides next action.
 */

const { fetchMarketContext } = require("../data/fetchMarket");
const { fetchPortfolio } = require("../data/fetchPortfolio");
const { fetchLiveRates } = require("../data/fetchRates");
const { searchNews } = require("../data/searchNews");
const { fetchTokenChart } = require("../data/fetchTokenChart");
const {
  buildMarinadeStakeTx,
  buildMarinadeUnstakeTx,
  buildJupiterSwapTx,
  buildKaminoLendTx,
  buildKaminoWithdrawTx,
} = require("../engine/transactionBuilder");

const {
  buildJitoStakeTx,
  buildJitoUnstakeTx,
} = require("../engine/jitoBuilder");

const {
  buildSanctumStakeInfTx,
  buildSanctumUnstakeInfTx,
  buildSanctumLstSwapTx,
  fetchSanctumLstList,
} = require("../engine/sanctumBuilder");

const { fetchJitoData } = require("../data/fetchJitoData");
const { fetchSanctumData } = require("../data/fetchSanctumData");

const { loadTokenRegistry, getToken, searchToken, searchTokenLive } = require("../data/tokenRegistry");
const { analyseAllPools, suggestStrategy, fetchAllPools } = require("../engine/risk");
const { buildFallbackPools } = require("../engine/risk/strategyEngine");
const { createWithRetry, LLM_MODEL } = require("./llmConfig");
const {
  buildOrcaOpenLpTx,
  buildOrcaHarvestTx,
  buildOrcaCloseLpTx,
  fetchOrcaPositions,
} = require("../engine/orcaBuilder");

const { resolveSnsAddress } = require("../data/resolveSns");
const { fetchJupPerpsAsset, fetchJupPerpsMarkets } = require("../data/fetchJupiterPerps");
const {
  fetchRaydiumPools,
  buildRaydiumAddLpTx,
  buildRaydiumRemoveLpTx,
  fetchRaydiumPositions,
} = require("../engine/raydiumBuilder");
const { fetchOrcaPoolsForPair, fetchOrcaTopPools }     = require("../data/fetchOrcaPools");
const { fetchMeteoraPoolsForPair, fetchMeteoraTopPools } = require("../data/fetchMeteoraPools");
const { buildJupPerpStrategy }      = require("../engine/crossVenueStrategy");
const { buildKaminoCashDepositTx, buildKaminoCashWithdrawTx } = require("../engine/kaminoVaultBuilder");
const { fetchPrimaryCashVault }     = require("../data/fetchKaminoCash");
const { computeRebalancePlan }      = require("../engine/rebalanceEngine");
const { getSentiment }      = require("./sentimentEngine");
const { fetchJupiterLendData }       = require("../data/fetchJupiterLendData");
const { fetchMarginfiData }          = require("../data/fetchMarginfiData");
const { buildJupiterLendDepositTx, buildJupiterLendWithdrawTx } = require("../engine/jupiterLendBuilder");
const { buildMarginfiDepositTx, buildMarginfiWithdrawTx, buildMarginfiBorrowTx } = require("../engine/marginfiBuilder");
const { fetchEthenaData } = require("../data/fetchEthenaData");
const { fetchOndoData }   = require("../data/fetchOndoData");
const { fetchKaminoObligations } = require("../data/fetchKaminoHealth");
const { buildOrcaRebalanceBundleTx, buildMeteoraRebalanceBundleTx } = require("../engine/lpRebalanceBundle");
const { logActivity }   = require("../monitor/activityLog");
const { getSettings, canAutoExecute } = require("../monitor/agentSettings");
const { projectYield }  = require("../data/projectPortfolio");
const { evaluateRisk }  = require("../data/riskGate");
const { compilePlan }   = require("../engine/planCompiler");
const { getActivityLog } = require("../monitor/activityLog");

// â"€â"€â"€ Profile context helper â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

const RISK_LABELS_SERVER = {
  low:    { label: "Safe" },
  medium: { label: "Balanced" },
  high:   { label: "Aggressive" },
};
const GOAL_LABELS_SERVER = {
  passive_income: { label: "Passive income" },
  growth:         { label: "Grow my bag" },
  trading:        { label: "Active trading" },
  exploring:      { label: "Just exploring" },
};
const EXP_LABELS_SERVER = {
  beginner:     "Beginner",
  intermediate: "Intermediate",
  advanced:     "Advanced",
};

function profileToContext(profile) {
  if (!profile) return "";
  const risk   = RISK_LABELS_SERVER[profile.riskTolerance]?.label ?? profile.riskTolerance ?? "unknown";
  const goal   = GOAL_LABELS_SERVER[profile.goal]?.label           ?? profile.goal           ?? "unknown";
  const exp    = EXP_LABELS_SERVER[profile.experience]             ?? profile.experience      ?? "unknown";
  const budget = profile.monthlyBudget ? `Monthly DeFi budget: ~$${profile.monthlyBudget}.` : "";
  return `\nUser profile: Risk=${risk}, Goal=${goal}, Experience=${exp}. ${budget} Tailor all suggestions to this profile â€" don't show high-risk options to a Safe user, don't over-explain to an Advanced user.`;
}

const AUTOPILOT_STRATEGY_NAMES = {
  yield:        "Yield Farmer",
  balanced:     "Balanced",
  preservation: "Capital Safe",
  aggressive:   "Max Yield",
};
const AUTOPILOT_TARGETS = {
  yield:        { liquid: 10, staked: 60, lending: 30 },
  balanced:     { liquid: 40, staked: 40, lending: 20 },
  preservation: { liquid: 70, staked: 20, lending: 10 },
  aggressive:   { liquid: 5,  staked: 70, lending: 25 },
};

function sandboxToContext(sandboxMode, sandboxVirtualBalances) {
  if (!sandboxMode) return "";
  let balLine = "200 USDC, 1 SOL (default starting balance)";
  if (sandboxVirtualBalances && Object.keys(sandboxVirtualBalances).length > 0) {
    balLine = Object.entries(sandboxVirtualBalances)
      .filter(([, v]) => v > 0.000001)
      .map(([k, v]) => `${+v.toFixed(4)} ${k}`)
      .join(", ") || balLine;
  }
  return `\n\nSANDBOX MODE ACTIVE: This is a paper-trading simulation. No real transactions will execute â€" the client intercepts and simulates everything locally. Virtual balances: ${balLine}. When building transactions, use these virtual balances for pre-flight checks (NOT the on-chain wallet). Portfolio queries return the virtual state above. Describe what WOULD happen in real DeFi but frame it as a simulation. Keep the same personality and depth â€" sandbox is for learning and practice.`;
}

function autopilotToContext(config) {
  if (!config?.enabled || !config?.strategyId) return "";
  const name    = AUTOPILOT_STRATEGY_NAMES[config.strategyId] ?? config.strategyId;
  const targets = AUTOPILOT_TARGETS[config.strategyId] ?? {};
  return `\nAutopilot: ACTIVE â€" ${name} strategy (target: ${targets.liquid ?? "?"}% liquid, ${targets.staked ?? "?"}% staked, ${targets.lending ?? "?"}% lending). Drift alert at ${config.driftThreshold ?? 10}%. Prioritize moves that bring the portfolio toward these targets.`;
}
const { buildDcaOrderTx, getDcaOrders, cancelDcaOrderTx } = require("../engine/jupiterDca");
const { buildLimitOrderTx, buildOcoOrderTx, getLimitOrders, cancelLimitOrderTx } = require("../engine/jupiterTrigger");
const { buildKaminoOpenLeverageTx, buildKaminoCloseLeverageTx, fetchLeverageVaults } = require("../engine/kaminoLeverageBuilder");
const {
  buildMeteoraOpenDlmmTx,
  buildMeteoraRemoveLiquidityTx,
  buildMeteoraClaimFeesTx,
  buildMeteoraClaimRewardsTx,
  buildMeteoraVaultDepositTx,
  buildMeteoraVaultWithdrawTx,
  fetchMeteoraUserPositions,
} = require("../engine/meteoraBuilder");

// â"€â"€â"€ Pre-flight balance check â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
// Catches obvious insufficient-balance errors before building the tx.
// Returns { ok: true } or { __preflight_failed: true, message: string }.

const MIN_FEE_SOL = 0.015; // keep this much SOL for network fees

function preflightBalance(toolName, args, walletContext) {
  if (walletContext.sandboxMode) return { ok: true }; // virtual balances managed client-side
  const sol = Number(walletContext.solBalance ?? 0);

  const failMsg = (need, have = sol, unit = "SOL") =>
    `not enough ${unit} for this â€" you have ${have.toFixed(4)} ${unit} but need ${need.toFixed(4)} ${unit} (includes ~${MIN_FEE_SOL} SOL for fees). try a smaller amount.`;

  if (toolName === "prepare_stake_transaction") {
    const need = Number(args.amount_sol ?? 0) + MIN_FEE_SOL;
    if (sol < need) return { __preflight_failed: true, message: failMsg(need) };
  }

  if (toolName === "prepare_swap_transaction") {
    if ((args.input_token || "").toUpperCase() === "SOL") {
      const need = Number(args.amount ?? 0) + MIN_FEE_SOL;
      if (sol < need) return { __preflight_failed: true, message: failMsg(need) };
    }
  }

  if (toolName === "prepare_lend_transaction") {
    if ((args.token || "").toUpperCase() === "SOL") {
      const need = Number(args.amount ?? 0) + MIN_FEE_SOL;
      if (sol < need) return { __preflight_failed: true, message: failMsg(need) };
    }
  }

  if (toolName === "open_kamino_leverage") {
    // Kamino has NO minimum deposit — only need ~0.035 SOL for account rent (refunded on exit) + fees
    const deposit = Number(args.depositAmount ?? 0);
    const need = deposit + MIN_FEE_SOL;
    if (deposit > 0 && sol < need) {
      return { __preflight_failed: true, message: `you want to deposit ${deposit} SOL but only have ${sol.toFixed(4)} SOL. Try depositing ${Math.max(0, sol - MIN_FEE_SOL).toFixed(4)} SOL or less (keeping ~${MIN_FEE_SOL} SOL for fees). There's no minimum deposit on Kamino.` };
    }
    // Only block if wallet can't even cover rent + fees
    if (sol < 0.05) return { __preflight_failed: true, message: `your SOL balance (${sol.toFixed(4)}) is too low to cover account creation rent (~0.0315 SOL, refunded on exit) plus transaction fees. Add a bit more SOL to your wallet first.` };
  }

  if (toolName === "prepare_stake_transaction" || toolName === "prepare_lend_transaction") {
    if (sol < MIN_FEE_SOL + 0.001) {
      return { __preflight_failed: true, message: `your SOL balance is too low to cover transaction fees. add at least 0.02 SOL to your wallet first.` };
    }
  }

  return { ok: true };
}

// Cached SOL price — updated whenever get_yield_rates runs, used by attachRisk
let _cachedSolPrice = 150;

// Attach a riskEvaluation field to any transaction tool result
function attachRisk(result, protocol, action, amountUsd) {
  if (!result || result.error || result.__preflight_failed) return result;
  try {
    result.riskEvaluation = evaluateRisk(protocol, action, amountUsd ?? 0);
  } catch {}
  return result;
}

// â"€â"€â"€ Liquidation price helper â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function calcLiquidationPrice(entryPrice, leverage, ltvThreshold = 0.82) {
  if (leverage <= 1 || entryPrice <= 0) return null;
  return +(entryPrice * (leverage - 1) / (leverage * ltvThreshold)).toFixed(2);
}

// â"€â"€â"€ Tool definitions (OpenAI function-calling format) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_portfolio",
      description:
        "Fetch the user's full Solana portfolio: SOL balance, SPL tokens, Marinade staking positions, and Kamino lending positions.",
      parameters: {
        type: "object",
        properties: {
          wallet: { type: "string", description: "Solana wallet address" },
        },
        required: ["wallet"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_yield_rates",
      description:
        "Fetch live APY rates from Marinade (staking), Kamino (lending/vaults), and current SOL price from Jupiter.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_market_data",
      description:
        "Fetch live market context: SOL price, top Solana DeFi yield pools from DeFiLlama, and trending tokens from Birdeye.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "prepare_stake_transaction",
      description:
        "Build a Marinade Finance staking transaction (SOL â†' mSOL). Returns a serialized transaction for the user to review and sign.",
      parameters: {
        type: "object",
        properties: {
          amount_sol: {
            type: "number",
            description: "Amount of SOL to stake",
          },
          wallet: { type: "string", description: "User's wallet address" },
        },
        required: ["amount_sol", "wallet"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "prepare_swap_transaction",
      description:
        "Build a Jupiter aggregator swap transaction. Supports any token listed on Jupiter (~1500+ tokens). Returns a serialized transaction for the user to review and sign.",
      parameters: {
        type: "object",
        properties: {
          input_token: {
            type: "string",
            description: "Input token symbol or mint address (e.g. SOL, USDC, BONK, WIF, JUP, or any Jupiter-listed token)",
          },
          output_token: {
            type: "string",
            description: "Output token symbol or mint address (e.g. USDC, SOL, or any Jupiter-listed token)",
          },
          amount: {
            type: "number",
            description: "Amount of input token to swap",
          },
          wallet: { type: "string", description: "User's wallet address" },
        },
        required: ["input_token", "output_token", "amount", "wallet"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "prepare_lend_transaction",
      description:
        "Build a Kamino Finance lending deposit transaction. Supported tokens: SOL, USDC, USDT, mSOL. Returns a serialized transaction for the user to review and sign.",
      parameters: {
        type: "object",
        properties: {
          token: {
            type: "string",
            description: "Token to lend -- one of: SOL, USDC, USDT, mSOL",
          },
          amount: { type: "number", description: "Amount to deposit" },
          wallet: { type: "string", description: "User's wallet address" },
        },
        required: ["token", "amount", "wallet"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "prepare_unstake_transaction",
      description:
        "Build a Marinade liquid unstake transaction (mSOL â†' SOL). Instantly converts mSOL back to SOL with a ~0.3% fee. Use when the user wants to unstake, withdraw their stake, get SOL back from mSOL, or exit their staking position.",
      parameters: {
        type: "object",
        properties: {
          amount_msol: {
            type: "number",
            description: "Amount of mSOL to unstake back to SOL",
          },
          wallet: { type: "string", description: "User's wallet address" },
        },
        required: ["amount_msol", "wallet"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "prepare_withdraw_transaction",
      description:
        "Build a Kamino lending withdrawal transaction. Returns deposited tokens plus accrued interest to the user's wallet. Use when the user wants to withdraw from Kamino, exit a lending position, or get their tokens back.",
      parameters: {
        type: "object",
        properties: {
          token: {
            type: "string",
            description: "Token to withdraw (SOL, USDC, mSOL, etc.)",
          },
          amount: {
            type: "number",
            description: "Amount to withdraw",
          },
          wallet: { type: "string", description: "User's wallet address" },
        },
        required: ["token", "amount", "wallet"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_news",
      description:
        "Search the web for latest crypto/DeFi news to ground trading recommendations. Use when the user asks about market sentiment, timing, whether to buy/sell/stake, or 'should I...' questions. Also use proactively before giving strategy advice to check for breaking news.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Search query related to the topic (e.g. 'Solana staking news 2026', 'SOL price prediction', 'Marinade Finance update')",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pool_risks",
      description:
        "Fetch live DeFi pools from Kamino, Orca, and Meteora, score each one 0-100 for risk, and return them ranked safest-first. Each result includes a risk label (low/medium/high), score breakdown, human-readable reasons, warnings, and scam flags. Use when the user asks: which pools are safest, best yield right now, is this pool safe, compare pools, show Kamino vaults/LP pairs, or any question about DeFi opportunities. When asking about a specific protocol, pass protocol filter and set limit high (50) to show all pools.",
      parameters: {
        type: "object",
        properties: {
          min_score: {
            type: "number",
            description: "Only return pools with risk score >= this value (0-100). Default 0 = all pools.",
          },
          limit: {
            type: "number",
            description: "Maximum number of pools to return. Default 10. Set to 50 when user asks for all pools from a specific protocol.",
          },
          protocol: {
            type: "string",
            description: "Filter results to a specific protocol. Exact match on protocol name, e.g. 'Kamino Finance', 'Orca', 'Meteora'. Omit to return pools from all protocols.",
          },
          action: {
            type: "string",
            enum: ["lp", "lend", "stake"],
            description: "Filter by pool type: 'lp' for liquidity pairs, 'lend' for lending markets, 'stake' for staking. Omit for all types.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suggest_strategy",
      description:
        "Generate a personalised DeFi allocation plan based on the user's balance and risk preference. Returns a full breakdown: which pools to use, how much to allocate to each, expected blended APY, and justification. Use when the user asks: what should I do with my SOL/USDC, suggest a strategy, how should I allocate, give me a plan, or 'manage my portfolio'.",
      parameters: {
        type: "object",
        properties: {
          balance_usd: {
            type: "number",
            description: "Total USD value to allocate across the strategy",
          },
          risk_preference: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "User's risk appetite: low = stable yields only, medium = balanced, high = maximise APY",
          },
        },
        required: ["balance_usd", "risk_preference"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_token",
      description:
        "Look up a Solana token by name, symbol, or mint address using the Jupiter token registry (~1500+ verified tokens). Use this whenever the user asks about a token's address, decimals, name, or 'what is X token', or when you need to resolve a token before swapping.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Token symbol, name, or mint address to search (e.g. 'PENGU', 'pengu coin', 'Bonk', 'dogwifhat', or a base58 address)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_token_chart",
      description:
        "Fetch live price chart data (24H), token stats (price, 24h change, volume, market cap, FDV, supply), and metadata (name, logo) for any Solana token. USE THIS whenever the user asks about a token's price, chart, stats, market cap, volume, or says 'show me X', 'what's the price of X', 'X chart', 'X stats'. Returns structured data that renders as a beautiful chart card in the UI.",
      parameters: {
        type: "object",
        properties: {
          token: {
            type: "string",
            description: "Token symbol (e.g. SOL, BONK, JUP, WIF) or mint address",
          },
        },
        required: ["token"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "prepare_orca_lp_transaction",
      description:
        "Open a full-range liquidity provider (LP) position on Orca Whirlpools. The user deposits two tokens into a pool and earns trading fees. Full-range means the position is always active regardless of price movement. Use this when the user wants to provide liquidity on Orca, 'add to an Orca pool', or 'LP on Orca'.",
      parameters: {
        type: "object",
        properties: {
          tokenA:   { type: "string", description: "First token symbol or mint (e.g. 'SOL')" },
          tokenB:   { type: "string", description: "Second token symbol or mint (e.g. 'USDC')" },
          amountA:  { type: "number", description: "Amount of tokenA to deposit (human units, e.g. 1.5 for 1.5 SOL)" },
        },
        required: ["tokenA", "tokenB", "amountA"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "harvest_orca_position",
      description:
        "Harvest accumulated trading fees and rewards from an open Orca LP position without removing liquidity. Use when the user wants to 'collect fees', 'harvest Orca rewards', or 'claim my LP earnings'.",
      parameters: {
        type: "object",
        properties: {
          positionMint: { type: "string", description: "The position NFT mint address" },
        },
        required: ["positionMint"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "close_orca_position",
      description:
        "Remove all liquidity from an Orca LP position and close it. Returns both tokens to the wallet. Use when the user wants to 'exit Orca', 'close my LP', or 'remove liquidity from Orca'.",
      parameters: {
        type: "object",
        properties: {
          positionMint: { type: "string", description: "The position NFT mint address" },
        },
        required: ["positionMint"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_orca_positions",
      description:
        "Fetch all open Orca LP positions for the user's wallet. Use when the user asks 'what are my Orca positions', 'show my LP positions', or 'am I in any Orca pools'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "create_dca_order",
      description:
        "Set up a recurring DCA (Dollar Cost Averaging) order via Jupiter. Buys a token on a fixed schedule. Use when the user says things like 'invest $50 in SOL every week', 'DCA into BONK daily', or 'buy SOL automatically every month'. Fee: 0.1% per execution.",
      parameters: {
        type: "object",
        properties: {
          inputToken:      { type: "string", description: "Token to spend (e.g. 'USDC')" },
          outputToken:     { type: "string", description: "Token to accumulate (e.g. 'SOL')" },
          amountPerCycle:  { type: "number", description: "Amount of inputToken per cycle (e.g. 50 for $50 USDC)" },
          intervalStr:     { type: "string", description: "Frequency: 'day', 'week', 'month', or seconds as integer" },
          cycles:          { type: "number", description: "Number of cycles (optional -- defaults: daily=30, weekly=52, monthly=12)" },
        },
        required: ["inputToken", "outputToken", "amountPerCycle", "intervalStr"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_dca_orders",
      description:
        "List the user's active DCA/recurring orders. Use when user asks 'show my DCA', 'what are my recurring buys', or 'am I DCA-ing anything'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_dca_order",
      description:
        "Cancel an active DCA/recurring order. Returns unspent input tokens to the wallet. Use when user says 'stop my DCA', 'cancel my recurring buy', or 'stop buying SOL every week'.",
      parameters: {
        type: "object",
        properties: {
          orderAddress: { type: "string", description: "The order's public key / address" },
        },
        required: ["orderAddress"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_limit_order",
      description:
        "Create a Jupiter limit order that executes when a token hits a target USD price. Use when user says 'buy SOL when it drops to $120', 'sell my BONK if it reaches $0.00005', or 'place a limit order'. Min $10. Orders expire in 7 days by default.",
      parameters: {
        type: "object",
        properties: {
          inputToken:   { type: "string", description: "Token to sell/spend (e.g. 'USDC' to buy, or 'SOL' to sell)" },
          outputToken:  { type: "string", description: "Token to receive" },
          inputAmount:  { type: "number", description: "Amount of inputToken to spend (min 10 USD equivalent)" },
          triggerPrice: { type: "number", description: "USD price of outputToken at which order fires" },
          expireIn:     { type: "string", description: "Order expiry: '1d', '7d', '30d' (default '7d')" },
        },
        required: ["inputToken", "outputToken", "inputAmount", "triggerPrice"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_oco_order",
      description:
        "Create a Take Profit + Stop Loss bracket (OCO) via Jupiter Trigger. Protects an existing holding: one order fires and the other is cancelled automatically. Use when user says 'set TP at $200 and SL at $130 for my SOL', 'protect my SOL position', or 'set a bracket order'.",
      parameters: {
        type: "object",
        properties: {
          holdingToken:     { type: "string", description: "Token the user holds (e.g. 'SOL')" },
          quoteToken:       { type: "string", description: "Token to receive on exit (e.g. 'USDC')" },
          holdingAmount:    { type: "number", description: "How much of holdingToken to protect" },
          takeProfitPrice:  { type: "number", description: "USD price to sell at for profit" },
          stopLossPrice:    { type: "number", description: "USD price to sell at to cut losses" },
        },
        required: ["holdingToken", "quoteToken", "holdingAmount", "takeProfitPrice", "stopLossPrice"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_limit_orders",
      description:
        "List the user's active limit orders. Use when user asks 'show my limit orders', 'what orders do I have open', or 'are any of my orders filled'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_limit_order",
      description:
        "Cancel an active limit order. Use when user says 'cancel my limit order', 'remove my buy order for SOL'.",
      parameters: {
        type: "object",
        properties: {
          orderAddress: { type: "string", description: "The order's public key / address" },
        },
        required: ["orderAddress"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_kamino_leverage",
      description:
        "Open a Kamino Multiply (leverage) position. Multiplies yield on an LST or token by flash-borrowing and redepositing in one atomic transaction. Common pairs: mSOL--SOL (multiply mSOL staking yield), JitoSOL--SOL, SOL--USDC (leveraged SOL). There is NO minimum deposit — Kamino only requires ~0.0315 SOL for account creation rent (refunded when position is fully closed). Use when user says 'leverage my SOL', 'multiply my mSOL yield', '2x my staking returns', or 'open a leveraged position on Kamino'. Use the user's requested amount as depositAmount — do NOT invent a minimum.",
      parameters: {
        type: "object",
        properties: {
          collToken:      { type: "string", description: "Collateral token (e.g. 'mSOL', 'JitoSOL', 'SOL')" },
          debtToken:      { type: "string", description: "Debt token to borrow (e.g. 'SOL', 'USDC')" },
          depositAmount:  { type: "number", description: "Amount of collToken to deposit. MUST come from the user's explicit request — if the user didn't specify an amount, ask them first. Never default to 1.0 or any other amount." },
          targetLeverage: { type: "number", description: "Target leverage multiplier (e.g. 2.0 for 2x, 3.0 for 3x). Max 10x." },
        },
        required: ["collToken", "debtToken", "depositAmount", "targetLeverage"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "close_kamino_leverage",
      description:
        "Close or reduce a Kamino Multiply (leverage) position. Repays the borrowed debt and returns collateral. Use when user says 'close my leverage position', 'exit my Kamino multiply', or 'deleverage my SOL'.",
      parameters: {
        type: "object",
        properties: {
          collToken:   { type: "string", description: "Collateral token of the position (e.g. 'mSOL')" },
          debtToken:   { type: "string", description: "Debt token of the position (e.g. 'SOL')" },
          withdrawPct: { type: "number", description: "Percentage of position to close (100 = full close, default 100)" },
        },
        required: ["collToken", "debtToken"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_leverage_vaults",
      description:
        "List available Kamino Multiply vaults with supported token pairs and max leverage. Use when user asks 'what leverage options are on Kamino', 'what can I multiply', or 'show me leverage vaults'.",
      parameters: { type: "object", properties: {} },
    },
  },
  // --- Meteora DLMM tools --------------------------------------------------
  {
    type: "function",
    function: {
      name: "meteora_open_dlmm",
      description:
        "Open a liquidity position on a Meteora DLMM pool and deposit tokens. DLMM uses concentrated liquidity bins for higher fee capture near the current price. Use when the user says 'add liquidity on Meteora', 'LP on Meteora', or 'provide liquidity to Meteora'. Strategy options: Spot (balanced around price), Curve (bell-curve), BidAsk (two-sided range).",
      parameters: {
        type: "object",
        properties: {
          tokenX:      { type: "string", description: "First token symbol (e.g. 'SOL')" },
          tokenY:      { type: "string", description: "Second token symbol (e.g. 'USDC')" },
          amountX:     { type: "number", description: "Amount of tokenX to deposit (human units)" },
          amountY:     { type: "number", description: "Amount of tokenY to deposit (0 for single-sided)" },
          strategy:    { type: "string", enum: ["Spot", "Curve", "BidAsk"], description: "Liquidity strategy (default: Spot)" },
          poolAddress: { type: "string", description: "Pool address (optional -- if omitted, uses highest-TVL pool for the pair)" },
        },
        required: ["tokenX", "tokenY", "amountX"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "meteora_remove_liquidity",
      description:
        "Remove liquidity from a Meteora DLMM position. Use when user says 'exit Meteora', 'remove my Meteora LP', or 'withdraw from Meteora pool'. Requires the pool address and position address (get these from meteora_get_positions).",
      parameters: {
        type: "object",
        properties: {
          poolAddress:     { type: "string", description: "The DLMM pool address" },
          positionAddress: { type: "string", description: "The position NFT address" },
          bps:             { type: "number", description: "Basis points to remove (10000 = 100% = full close, default 10000)" },
        },
        required: ["poolAddress", "positionAddress"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "meteora_claim_fees",
      description:
        "Claim accumulated swap fees from a Meteora DLMM position. Use when user says 'claim my Meteora fees', 'collect Meteora earnings', or 'harvest my DLMM fees'.",
      parameters: {
        type: "object",
        properties: {
          poolAddress:     { type: "string", description: "The DLMM pool address" },
          positionAddress: { type: "string", description: "The position address" },
        },
        required: ["poolAddress", "positionAddress"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "meteora_claim_rewards",
      description:
        "Claim liquidity mining (LM) reward tokens from a Meteora DLMM position. Use when user says 'claim Meteora rewards', 'collect LM rewards', or 'harvest Meteora emissions'.",
      parameters: {
        type: "object",
        properties: {
          poolAddress:     { type: "string", description: "The DLMM pool address" },
          positionAddress: { type: "string", description: "The position address" },
        },
        required: ["poolAddress", "positionAddress"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "meteora_vault_deposit",
      description:
        "Deposit a single token into a Meteora auto-compounding vault. The vault auto-compounds yield so no manual claiming is needed. Use when user says 'deposit into Meteora vault', 'put USDC in Meteora', or 'use Meteora yield vault'.",
      parameters: {
        type: "object",
        properties: {
          token:  { type: "string", description: "Token to deposit (e.g. 'USDC', 'SOL')" },
          amount: { type: "number", description: "Amount to deposit (human units)" },
        },
        required: ["token", "amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "meteora_vault_withdraw",
      description:
        "Withdraw tokens from a Meteora auto-compounding vault. Use when user says 'withdraw from Meteora vault', 'get my tokens back from Meteora vault'.",
      parameters: {
        type: "object",
        properties: {
          token:  { type: "string", description: "Token to withdraw (e.g. 'USDC', 'SOL')" },
          amount: { type: "number", description: "Amount to withdraw (human units)" },
        },
        required: ["token", "amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "meteora_get_positions",
      description:
        "Fetch all open Meteora DLMM positions for the user's wallet. Returns pool addresses, position addresses, bin ranges, and accrued fees. Use when user asks 'show my Meteora positions', 'what are my Meteora LPs', or 'am I in any Meteora pools'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_wallet",
      description:
        "Look up the SOL balance, SPL token holdings, and DeFi positions for ANY Solana wallet -- by address, .sol domain, or a person's real name. Use when the user asks about someone else's wallet: 'what does toly.sol hold', 'what is raj gokal holding', 'show anatoly's portfolio', 'how much SOL does abc.sol have', or pastes a public key. Pass the input exactly as the user said it -- the resolver handles name-to-domain inference automatically (e.g. 'raj gokal' -> tries rajgokal.sol, raj.sol, gokal.sol).",
      parameters: {
        type: "object",
        properties: {
          address_or_domain: {
            type: "string",
            description: "Wallet address (base58), .sol domain (e.g. 'toly.sol', 'toly'), or a person's real name (e.g. 'raj gokal', 'anatoly yakovenko'). Pass exactly what the user said.",
          },
        },
        required: ["address_or_domain"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_orca_pools",
      description:
        "Fetch live Orca Whirlpool pools for a token pair with APR data (fee APR + reward APR + total APR), TVL, and fee tier. Use when user asks 'what's the APR on Orca SOL-USDC', 'show Orca pools', 'best Orca pool for X-Y', or before recommending an Orca LP position. Omit both tokens to get top 10 pools by TVL.",
      parameters: {
        type: "object",
        properties: {
          tokenA: { type: "string", description: "First token symbol, e.g. SOL" },
          tokenB: { type: "string", description: "Second token symbol, e.g. USDC" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_meteora_pools",
      description:
        "Fetch live Meteora DLMM pools for a token pair with APR, fee rate, bin step, and TVL. Use when user asks 'what's the APR on Meteora', 'show Meteora pools for X-Y', or before recommending a Meteora LP position. Omit both tokens to get top pools by TVL.",
      parameters: {
        type: "object",
        properties: {
          tokenA: { type: "string", description: "First token symbol, e.g. SOL" },
          tokenB: { type: "string", description: "Second token symbol, e.g. USDC" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rebalance_lp",
      description:
        "Build a 3-step LP rebalance bundle: (1) close the out-of-range position, (2) swap tokens to 50/50, (3) reopen at the current price. Returns a transaction_bundle with all 3 steps shown upfront — user signs each one sequentially. Use when user asks 'rebalance my LP', 'my position is out of range', 'fix my Orca LP', 'recenter my position'. Requires positionMint for Orca. For Meteora use poolAddress + positionAddress.",
      parameters: {
        type: "object",
        properties: {
          protocol:          { type: "string", description: "'orca' or 'meteora'" },
          positionMint:      { type: "string", description: "Orca: position NFT mint address" },
          poolAddress:       { type: "string", description: "Meteora: pool address" },
          positionAddress:   { type: "string", description: "Meteora: position address" },
          tokenA:            { type: "string", description: "First token, e.g. SOL" },
          tokenB:            { type: "string", description: "Second token, e.g. USDC" },
          positionAmountUsd: { type: "number", description: "Estimated USD value of the position" },
          rangePct:          { type: "number", description: "Optional: range width as decimal (e.g. 0.22 = ±22%). Default 0.22." },
        },
        required: ["protocol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "raydium_get_pools",
      description:
        "Discover Raydium CPMM (Standard AMM) pools for a token pair. Returns pools ranked by TVL with APR (24h, 7d, 30d), fee rate, and pool ID. Use when user asks 'what Raydium pools are available for SOL-USDC', 'show Raydium yields', 'best Raydium pool', or before adding liquidity to pick the right pool.",
      parameters: {
        type: "object",
        properties: {
          tokenA: { type: "string", description: "First token symbol or mint (e.g. SOL, USDC)" },
          tokenB: { type: "string", description: "Second token symbol or mint (e.g. USDC, USDT)" },
        },
        required: ["tokenA", "tokenB"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "raydium_add_lp",
      description:
        "Add liquidity to a Raydium CPMM (Standard AMM) pool. Returns an unsigned Solana transaction for the user to sign. Use when user says 'add liquidity on Raydium', 'LP on Raydium', or 'provide liquidity to Raydium'. Call raydium_get_pools first if the user hasn't specified a pool. Requires tokenA, tokenB, amountA.",
      parameters: {
        type: "object",
        properties: {
          tokenA:  { type: "string", description: "First token symbol (e.g. SOL)" },
          tokenB:  { type: "string", description: "Second token symbol (e.g. USDC)" },
          amountA: { type: "number", description: "Amount of tokenA to deposit" },
        },
        required: ["tokenA", "tokenB", "amountA"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "raydium_remove_lp",
      description:
        "Remove liquidity from a Raydium CPMM pool and return both tokens to the wallet. Use when user says 'exit Raydium', 'remove my Raydium LP', 'withdraw from Raydium'. Call raydium_get_positions first if the user does not know their poolId.",
      parameters: {
        type: "object",
        properties: {
          poolId:   { type: "string", description: "The Raydium pool ID (from raydium_get_positions)" },
          lpAmount: { type: "number", description: "Amount of LP tokens to redeem (get from raydium_get_positions)" },
        },
        required: ["poolId", "lpAmount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "raydium_get_positions",
      description:
        "List all open Raydium LP positions for the user's wallet. Returns pool pairs, LP token amounts, and USD value. Use when user asks 'show my Raydium positions', 'what Raydium LPs do I have', or before removing liquidity.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_jupiter_perps_markets",
      description:
        "Fetch live Jupiter Perpetuals market data: current price, borrow rate (1h and annualised), max leverage. Supports SOL, BTC, ETH. Use when the user asks about perps, perpetuals, leveraged trading, longing/shorting, funding rates, or 'what can I trade on Jupiter Perps'. Pass a symbol for one market, omit for all three.",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Optional asset symbol: SOL, BTC, or ETH. Omit to get all markets.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "build_perp_strategy",
      description:
        "Build a Jupiter Perpetuals trade preview for a directional bet on SOL, BTC, or ETH. Returns: entry price, leverage, notional size, estimated liquidation price, 30-day borrow cost, and three payoff scenarios (bull / flat / bear). Use when the user asks to 'open a long', 'short SOL', 'trade perps', 'leverage trade', or requests a perp strategy. Always call this before prepare_jupiter_perp_transaction -- it is step 1 of the two-step confirmation flow.",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Asset to trade: SOL, BTC, or ETH",
          },
          direction: {
            type: "string",
            enum: ["bullish", "bearish"],
            description: "Trade direction",
          },
          amountUsd: {
            type: "number",
            description: "Margin in USD to deploy",
          },
          leverage: {
            type: "number",
            description: "Leverage multiplier (1-100, default 5)",
          },
        },
        required: ["symbol", "direction", "amountUsd"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sentiment",
      description:
        "Fetch live social + news sentiment for any Solana token. Aggregates StockTwits community bullish/bearish signals, Twitter mentions (via Nitter), Google News headlines, and on-chain price/volume data -- then scores 0-100 and labels Bullish/Bearish/Neutral with a one-sentence summary. USE THIS when the user asks: 'what is the sentiment on BONK', 'is SOL bullish right now', 'what does CT think about WIF', 'community sentiment', 'market mood', 'should I buy based on sentiment'. Returns structured data rendered as a rich sentiment card.",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Token symbol, e.g. SOL, BONK, JUP, WIF",
          },
          mint: {
            type: "string",
            description: "Optional: mint address for richer on-chain data",
          },
        },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "stress_test_portfolio",
      description:
        "Simulate how the user's portfolio value changes under a SOL price move. Use when the user asks 'what if SOL drops X%', 'what happens if SOL crashes', 'stress test my portfolio', 'worst case scenario', 'show me a bear case', 'what if SOL goes to $X'. Fetches the live portfolio and reruns valuation at the simulated price. Returns current vs simulated total USD, per-bucket impact, and whether any leverage positions would be liquidated.",
      parameters: {
        type: "object",
        properties: {
          solMovePct: {
            type: "number",
            description: "Percentage move in SOL price. Negative = drop (e.g. -40 means SOL falls 40%). Positive = pump (e.g. +50).",
          },
          targetPrice: {
            type: "number",
            description: "Alternatively specify a target SOL price in USD (e.g. 80 means 'what if SOL goes to $80'). Used instead of solMovePct if provided.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suggest_rebalance",
      description:
        "Analyse the user's current portfolio allocation vs their autopilot target (or a specified strategy) and return a step-by-step rebalance plan. Use when the user says 'rebalance my portfolio', 'am I on target', 'what should I move', 'my portfolio is off', 'check my allocation', or when autopilot drift is detected. Always call get_portfolio + get_yield_rates first to have fresh data.",
      parameters: {
        type: "object",
        properties: {
          strategyId: {
            type: "string",
            description: "Target strategy: 'yield' (10% liquid, 60% staked, 30% lending), 'balanced' (40/40/20), 'preservation' (70/20/10), 'aggressive' (5/70/25). If omitted, uses the user's autopilot config if active.",
            enum: ["yield", "balanced", "preservation", "aggressive"],
          },
          driftThreshold: {
            type: "number",
            description: "Minimum drift % before flagging as action-needed (default 8). Lower = stricter.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_kamino_cash_vault",
      description:
        "Fetch live info about Kamino's CASH vault: current APY, TVL, accepted tokens (USDC/USDT), and strategy description. Use when the user asks about 'Kamino CASH', 'delta-neutral yield', 'safe stablecoin yield', 'earn on USDC/USDT with low risk', or 'what is Kamino CASH'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "kamino_cash_deposit",
      description:
        "Build a Kamino CASH vault deposit transaction. Deposits USDC or USDT into Kamino's delta-neutral yield vault managed by Gauntlet -- earns yield with minimal price risk. Use when the user wants to 'deposit into Kamino CASH', 'earn yield on USDC', 'put stablecoins to work', or 'delta-neutral yield'.",
      parameters: {
        type: "object",
        properties: {
          token:  { type: "string", description: "Token to deposit: USDC or USDT" },
          amount: { type: "number", description: "Amount to deposit" },
          wallet: { type: "string", description: "User's wallet address" },
        },
        required: ["token", "amount", "wallet"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "kamino_cash_withdraw",
      description:
        "Build a Kamino CASH vault withdrawal transaction. Redeems vault shares back to USDC or USDT including any accrued yield. Use when the user wants to 'withdraw from Kamino CASH', 'exit delta-neutral vault', 'get my USDC back from Kamino'.",
      parameters: {
        type: "object",
        properties: {
          token:  { type: "string", description: "Token to withdraw: USDC or USDT" },
          amount: { type: "number", description: "Amount to withdraw" },
          wallet: { type: "string", description: "User's wallet address" },
        },
        required: ["token", "amount", "wallet"],
      },
    },
  },
  // --- Jito tools ------------------------------------------------------------
  {
    type: "function",
    function: {
      name: "jito_stake",
      description:
        "Build a Jito liquid staking transaction (SOL -> jitoSOL). jitoSOL earns staking yield PLUS MEV tips shared by Jito validators -- typically ~7-8% APY, higher than vanilla staking. Use when the user says 'stake on Jito', 'get jitoSOL', 'Jito stake', or when recommending the highest-yield liquid staking option.",
      parameters: {
        type: "object",
        properties: {
          amount_sol: { type: "number", description: "Amount of SOL to stake" },
          wallet: { type: "string", description: "User's wallet address" },
        },
        required: ["amount_sol", "wallet"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "jito_unstake",
      description:
        "Build a Jito liquid unstake transaction (jitoSOL -> SOL). Redeems jitoSOL back to SOL via the Jito stake pool. Small withdrawal fee (~0.1%). Use when the user says 'unstake jitoSOL', 'exit Jito staking', or 'convert jitoSOL to SOL'.",
      parameters: {
        type: "object",
        properties: {
          amount_jitosol: { type: "number", description: "Amount of jitoSOL to unstake" },
          wallet: { type: "string", description: "User's wallet address" },
        },
        required: ["amount_jitosol", "wallet"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_jito_data",
      description:
        "Fetch live Jito data: jitoSOL APY (staking + MEV tips), stake pool TVL, exchange rate, and MEV tip floor stats. Use when the user asks about 'Jito APY', 'jitoSOL yield', 'Jito stats', 'MEV tips', or before recommending Jito staking.",
      parameters: { type: "object", properties: {} },
    },
  },
  // --- Sanctum tools ---------------------------------------------------------
  {
    type: "function",
    function: {
      name: "sanctum_stake_inf",
      description:
        "Build a Sanctum Infinity Pool staking transaction (SOL -> INF). INF spreads your SOL across 100+ validators for maximum decentralization -- earns blended staking yield (~7-8% APY) with zero single-validator risk. Use when the user says 'stake on Sanctum', 'get INF', 'Sanctum Infinity', or 'diversified staking'.",
      parameters: {
        type: "object",
        properties: {
          amount_sol: { type: "number", description: "Amount of SOL to stake" },
          wallet: { type: "string", description: "User's wallet address" },
        },
        required: ["amount_sol", "wallet"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sanctum_unstake_inf",
      description:
        "Build a Sanctum INF unstake transaction (INF -> SOL). Redeems INF back to SOL via Sanctum's Infinity Pool. Use when the user says 'unstake INF', 'exit Sanctum', or 'convert INF to SOL'.",
      parameters: {
        type: "object",
        properties: {
          amount_inf: { type: "number", description: "Amount of INF to unstake" },
          wallet: { type: "string", description: "User's wallet address" },
        },
        required: ["amount_inf", "wallet"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sanctum_lst_swap",
      description:
        "Swap between any Sanctum-integrated LSTs (e.g. jitoSOL -> mSOL, bSOL -> INF, mSOL -> jitoSOL). Routes through Sanctum's Infinity Pool for deep liquidity and minimal slippage -- often better rates than DEX swaps for LST-to-LST pairs. Use when user says 'swap jitoSOL to mSOL', 'convert my LST', or 'swap between staking tokens'.",
      parameters: {
        type: "object",
        properties: {
          input_token: { type: "string", description: "Input LST symbol or mint (e.g. 'jitoSOL', 'mSOL', 'bSOL', 'INF')" },
          output_token: { type: "string", description: "Output LST symbol or mint" },
          amount: { type: "number", description: "Amount of input token to swap" },
          wallet: { type: "string", description: "User's wallet address" },
        },
        required: ["input_token", "output_token", "amount", "wallet"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sanctum_data",
      description:
        "Fetch live Sanctum data: INF APY, and overview stats. Use when the user asks about 'Sanctum APY', 'INF yield', 'Sanctum stats', or before recommending Sanctum/INF staking.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sanctum_lsts",
      description:
        "Fetch the full list of Sanctum-integrated LSTs with metadata (symbol, name, mint, APY, TVL). Use when the user asks 'what LSTs does Sanctum support', 'show me all liquid staking tokens', 'Sanctum LST list', or 'compare staking options'.",
      parameters: { type: "object", properties: {} },
    },
  },
  // --- Jupiter Lend tools -----------------------------------------------------
  {
    type: "function",
    function: {
      name: "get_jupiter_lend_data",
      description:
        "Fetch live Jupiter Earn/Lend data: available tokens, supply APYs, TVL. Use when user asks about 'Jupiter Lend', 'Jupiter Earn', 'Jupiter lending rates', 'where can I earn yield on USDC/SOL', or before recommending a Jupiter Lend deposit.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "jupiter_lend_deposit",
      description:
        "Build a Jupiter Earn deposit transaction. Deposits tokens into Jupiter's lending vaults to earn supply yield. Supports SOL, USDC, USDT, and other tokens. Use when user says 'deposit on Jupiter Lend', 'earn yield on Jupiter', 'lend my USDC on Jupiter'.",
      parameters: {
        type: "object",
        properties: {
          token: { type: "string", description: "Token to deposit (e.g. 'USDC', 'SOL', 'USDT')" },
          amount: { type: "number", description: "Amount to deposit" },
          wallet: { type: "string", description: "User's wallet address" },
        },
        required: ["token", "amount", "wallet"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "jupiter_lend_withdraw",
      description:
        "Build a Jupiter Earn withdraw transaction. Withdraws tokens plus accrued yield from Jupiter's lending vaults. Use when user says 'withdraw from Jupiter Lend', 'exit Jupiter Earn', 'get my USDC back from Jupiter'.",
      parameters: {
        type: "object",
        properties: {
          token: { type: "string", description: "Token to withdraw (e.g. 'USDC', 'SOL')" },
          amount: { type: "number", description: "Amount to withdraw" },
          wallet: { type: "string", description: "User's wallet address" },
        },
        required: ["token", "amount", "wallet"],
      },
    },
  },
  // --- marginfi tools ---------------------------------------------------------
  {
    type: "function",
    function: {
      name: "get_marginfi_data",
      description:
        "Fetch live marginfi lending data: available banks/pools, supply APYs, borrow APYs, TVL. Use when user asks about 'marginfi', 'marginfi rates', 'marginfi lending', 'where can I borrow', or before recommending a marginfi deposit/borrow.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "marginfi_deposit",
      description:
        "Build a marginfi deposit/lending transaction. Deposits tokens into marginfi to earn supply yield. Deposited tokens also serve as collateral for borrowing. Supports SOL, USDC, USDT, mSOL, jitoSOL, and more. Use when user says 'deposit on marginfi', 'lend on marginfi', 'earn on marginfi'.",
      parameters: {
        type: "object",
        properties: {
          token: { type: "string", description: "Token to deposit (e.g. 'USDC', 'SOL')" },
          amount: { type: "number", description: "Amount to deposit" },
          wallet: { type: "string", description: "User's wallet address" },
        },
        required: ["token", "amount", "wallet"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "marginfi_withdraw",
      description:
        "Build a marginfi withdrawal transaction. Withdraws deposited tokens plus accrued interest from marginfi. Use when user says 'withdraw from marginfi', 'exit marginfi', 'get my tokens from marginfi'.",
      parameters: {
        type: "object",
        properties: {
          token: { type: "string", description: "Token to withdraw (e.g. 'USDC', 'SOL')" },
          amount: { type: "number", description: "Amount to withdraw" },
          wallet: { type: "string", description: "User's wallet address" },
        },
        required: ["token", "amount", "wallet"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "marginfi_borrow",
      description:
        "Build a marginfi borrow transaction. Borrows tokens against deposited collateral. Requires existing marginfi account with sufficient collateral. ALWAYS warn about liquidation risk. Use when user says 'borrow on marginfi', 'take a loan on marginfi', 'borrow USDC against my SOL'.",
      parameters: {
        type: "object",
        properties: {
          token: { type: "string", description: "Token to borrow (e.g. 'USDC', 'SOL')" },
          amount: { type: "number", description: "Amount to borrow" },
          wallet: { type: "string", description: "User's wallet address" },
        },
        required: ["token", "amount", "wallet"],
      },
    },
  },
  // --- Lending health + IL tools -----------------------------------------------
  {
    type: "function",
    function: {
      name: "get_lending_health",
      description:
        "Fetch the user's Kamino lending positions: collateral deposited, amount borrowed, health factor, and estimated SOL liquidation price. Use when user asks 'what's my health factor', 'am I at risk of liquidation', 'how much can SOL drop before I get liquidated', 'show my borrow position', 'check my Kamino health'. Returns risk level: safe / medium / high / critical.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_il",
      description:
        "Calculate the impermanent loss on an LP position given the token price ratio change since entry. Use when user asks 'what's my IL', 'how much impermanent loss do I have', 'compare my fees to IL', 'is my LP profitable'. Formula: IL = 2*sqrt(k)/(1+k) - 1 where k = current_price / entry_price.",
      parameters: {
        type: "object",
        properties: {
          entry_price:   { type: "number", description: "Price of token A in USD when you entered the LP" },
          current_price: { type: "number", description: "Current price of token A in USD" },
          position_value_usd: { type: "number", description: "Current USD value of the LP position (optional, for computing dollar IL amount)" },
        },
        required: ["entry_price", "current_price"],
      },
    },
  },
  // --- Ethena sUSDe tools -----------------------------------------------------
  {
    type: "function",
    function: {
      name: "get_susde_data",
      description:
        "Fetch live Ethena sUSDe data: current APY (from funding rates), TVL, and risk factors. sUSDe is a delta-neutral synthetic dollar earning 10-20%+ APY. Use when user asks about 'sUSDe', 'Ethena', 'best stablecoin yield', 'delta neutral yield', or before recommending sUSDe.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "enter_susde",
      description:
        "Build a USDC -> sUSDe swap transaction via Jupiter. Enters an Ethena sUSDe yield position. Use when user says 'buy sUSDe', 'enter Ethena', 'get sUSDe yield', 'put USDC into sUSDe'. Always call get_susde_data first to show live APY. Do NOT recommend for conservative/Safe-risk users. Cap at 40% of portfolio.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount of USDC to swap into sUSDe" },
          wallet: { type: "string", description: "User's wallet address" },
        },
        required: ["amount", "wallet"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "exit_susde",
      description:
        "Build a sUSDe -> USDC swap transaction via Jupiter. Exits an Ethena sUSDe position. Use when user says 'sell sUSDe', 'exit Ethena', 'convert sUSDe to USDC'.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount of sUSDe to swap back to USDC" },
          wallet: { type: "string", description: "User's wallet address" },
        },
        required: ["amount", "wallet"],
      },
    },
  },
  // --- Ondo USDY tools --------------------------------------------------------
  {
    type: "function",
    function: {
      name: "get_usdy_data",
      description:
        "Fetch live Ondo USDY data: current price, APY (~5% from US T-bills), TVL, and risk factors. USDY is a tokenized US Treasury bill product — low risk, stable yield. Use when user asks about 'USDY', 'Ondo', 'Treasury yield', 'RWA yield', 'safe stablecoin yield', or before recommending USDY.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "enter_usdy",
      description:
        "Build a USDC -> USDY swap transaction via Jupiter. Enters an Ondo USDY Treasury yield position. Use when user says 'buy USDY', 'get Treasury yield', 'enter Ondo'. Always call get_usdy_data first. Flag geo-restriction for US-based users. Check liquidity for swaps > $10k.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount of USDC to swap into USDY" },
          wallet: { type: "string", description: "User's wallet address" },
        },
        required: ["amount", "wallet"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "exit_usdy",
      description:
        "Build a USDY -> USDC swap transaction via Jupiter. Exits an Ondo USDY position. Use when user says 'sell USDY', 'exit Ondo', 'convert USDY to USDC'.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount of USDY to swap back to USDC" },
          wallet: { type: "string", description: "User's wallet address" },
        },
        required: ["amount", "wallet"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "project_portfolio",
      description:
        "Project the future value of a DeFi strategy over 30, 60, or 90 days across three SOL price scenarios: bull (+30%), base (flat), bear (-30%). Use when: user asks 'what would I earn if I staked X SOL for 30 days', 'show me projections', 'what's the best/worst case', 'how much would I make in 3 months', or when presenting a strategy in Learn mode. Always use live APY from get_yield_rates or the relevant data tool first. Returns per-scenario: end value, yield earned in USD and native token, daily earnings, and upside vs just holding SOL.",
      parameters: {
        type: "object",
        properties: {
          amountSol:  { type: "number", description: "Amount in SOL (for SOL-denominated strategies like staking)" },
          amountUsd:  { type: "number", description: "Amount in USD (for stablecoin strategies like lending USDC)" },
          apy:        { type: "number", description: "Annual percentage yield as a number, e.g. 7.8 for 7.8%" },
          protocol:   { type: "string", description: "Protocol name, e.g. 'Marinade Finance', 'Kamino', 'Jupiter Lend'" },
          action:     { type: "string", description: "Action type: 'stake', 'lend', 'lp'" },
          days:       { type: "number", enum: [30, 60, 90], description: "Projection period in days" },
        },
        required: ["apy", "protocol", "action", "days"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compile_plan",
      description:
        "Assemble multiple already-built transaction tool results into a single multi-step bundle that the user can sign step-by-step. Call this AFTER you have called all the individual transaction tools (prepare_stake_transaction, prepare_swap_transaction, etc.) and collected their serializedTx results. Returns a transaction_bundle that the frontend renders as a step-by-step confirmation flow. Use for any multi-step strategy: unstake → swap → lend, LP rebalance, etc.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short bundle title, e.g. 'Unstake → Swap → Lend'" },
          why:   { type: "string", description: "One sentence explaining why this plan makes sense for the user" },
          narrativeLevel: {
            type: "string",
            enum: ["full", "brief", "silent"],
            description: "Derived by Homie from user history — full: explain every step, brief: explain risky steps only, silent: label+amounts only",
          },
          estimatedGas: { type: "string", description: "Total estimated gas across all steps, e.g. '~0.003 SOL'" },
          steps: {
            type: "array",
            description: "Ordered list of steps, each containing the serializedTx from the relevant transaction tool",
            items: {
              type: "object",
              properties: {
                label:           { type: "string", description: "Short action label, e.g. 'Unstake mSOL'" },
                protocol:        { type: "string", description: "Protocol name" },
                serializedTx:    { type: "string", description: "The serializedTx field from the transaction tool result" },
                estimatedOutput: { type: "string", description: "What the user receives, e.g. '2.4 SOL'" },
                plainEnglish:    { type: "string", description: "One sentence, their exact numbers, no jargon. Always generate even if narrativeLevel is silent." },
                riskLevel:       { type: "string", enum: ["low", "medium", "high"], description: "Risk of this specific step" },
                amountUsd:       { type: "number", description: "USD value being transacted in this step" },
              },
              required: ["label", "protocol", "serializedTx", "plainEnglish"],
            },
          },
        },
        required: ["title", "steps", "narrativeLevel"],
      },
    },
  },
];

// --- Transaction tools - hard enforcement at the executor level --------------
// Do NOT rely on prompt instructions alone for safety-critical behaviour.
// The executor is the last line of defence before real money moves.

const TRANSACTION_TOOLS = new Set([
  "prepare_stake_transaction",
  "prepare_unstake_transaction",
  "prepare_swap_transaction",
  "prepare_lend_transaction",
  "prepare_withdraw_transaction",
  "prepare_orca_lp_transaction",
  "harvest_orca_position",
  "close_orca_position",
  "create_dca_order",
  "cancel_dca_order",
  "create_limit_order",
  "create_oco_order",
  "cancel_limit_order",
  "open_kamino_leverage",
  "close_kamino_leverage",
  "meteora_open_dlmm",
  "meteora_remove_liquidity",
  "meteora_claim_fees",
  "meteora_claim_rewards",
  "meteora_vault_deposit",
  "meteora_vault_withdraw",
  "kamino_cash_deposit",
  "kamino_cash_withdraw",
  "jito_stake",
  "jito_unstake",
  "sanctum_stake_inf",
  "sanctum_unstake_inf",
  "sanctum_lst_swap",
  "jupiter_lend_deposit",
  "jupiter_lend_withdraw",
  "marginfi_deposit",
  "marginfi_withdraw",
  "marginfi_borrow",
  "enter_susde",
  "exit_susde",
  "enter_usdy",
  "exit_usdy",
]);

// --- Sandbox stub builder ---------------------------------------------------
// Returns a transaction_preview-shaped object with SANDBOX_PLACEHOLDER serializedTx.
// The client intercepts this and routes to simulateSandboxTx() instead of broadcasting.

function buildSandboxTxStub(toolName, args) {
  let action, protocol, inputToken, inputAmount, outputToken;

  switch (toolName) {
    case "prepare_stake_transaction":
      action = `Liquid stake ${args.amount_sol} SOL`;
      protocol = "Marinade Finance"; inputToken = "SOL"; inputAmount = args.amount_sol; outputToken = "mSOL";
      break;
    case "prepare_unstake_transaction":
      action = `Unstake ${args.amount_msol} mSOL -> SOL`;
      protocol = "Marinade Finance"; inputToken = "mSOL"; inputAmount = args.amount_msol; outputToken = "SOL";
      break;
    case "prepare_swap_transaction":
      action = `Swap ${args.amount} ${args.input_token} -> ${args.output_token}`;
      protocol = "Jupiter"; inputToken = args.input_token; inputAmount = args.amount; outputToken = args.output_token;
      break;
    case "prepare_lend_transaction":
      action = `Deposit ${args.amount} ${args.token} into Kamino`;
      protocol = "Kamino Finance"; inputToken = args.token; inputAmount = args.amount;
      break;
    case "prepare_withdraw_transaction":
      action = `Withdraw ${args.amount} ${args.token} from Kamino`;
      protocol = "Kamino Finance"; inputToken = args.token; inputAmount = args.amount;
      break;
    case "open_kamino_leverage":
      action = `Open ${args.targetLeverage ?? 2}x leverage on ${args.depositAmount} ${args.collToken || "SOL"}`;
      protocol = "Kamino Multiply"; inputToken = args.collToken || "SOL"; inputAmount = args.depositAmount;
      break;
    case "close_kamino_leverage":
      action = `Close leverage position on ${args.collToken || "SOL"}`;
      protocol = "Kamino Multiply"; inputToken = args.collToken || "SOL";
      break;
    case "prepare_orca_lp_transaction":
      action = `Open ${args.tokenA}-${args.tokenB} LP on Orca`;
      protocol = "Orca Whirlpools"; inputToken = args.tokenA; inputAmount = args.amountA;
      break;
    case "meteora_open_dlmm":
      action = `Open ${args.tokenX}-${args.tokenY} LP on Meteora DLMM`;
      protocol = "Meteora DLMM"; inputToken = args.tokenX; inputAmount = args.amountX;
      break;
    case "meteora_vault_deposit":
      action = `Deposit ${args.amount} ${args.token} into Meteora vault`;
      protocol = "Meteora Vault"; inputToken = args.token; inputAmount = args.amount;
      break;
    case "meteora_vault_withdraw":
      action = `Withdraw ${args.amount} ${args.token} from Meteora vault`;
      protocol = "Meteora Vault"; inputToken = args.token; inputAmount = args.amount;
      break;
    case "create_dca_order":
      action = `Create DCA: ${args.inAmount} ${args.inputMint} -> ${args.outputMint}`;
      protocol = "Jupiter DCA"; inputToken = args.inputMint; inputAmount = args.inAmount;
      break;
    case "create_limit_order":
      action = `Limit order: ${args.inputAmount} ${args.inputToken} -> ${args.outputToken} at $${args.triggerPrice}`;
      protocol = "Jupiter Trigger"; inputToken = args.inputToken; inputAmount = args.inputAmount;
      break;
    case "jito_stake":
      action = `Liquid stake ${args.amount_sol} SOL -> jitoSOL (Jito)`;
      protocol = "Jito Staking"; inputToken = "SOL"; inputAmount = args.amount_sol; outputToken = "jitoSOL";
      break;
    case "jito_unstake":
      action = `Unstake ${args.amount_jitosol} jitoSOL -> SOL`;
      protocol = "Jito Staking"; inputToken = "jitoSOL"; inputAmount = args.amount_jitosol; outputToken = "SOL";
      break;
    case "sanctum_stake_inf":
      action = `Stake ${args.amount_sol} SOL -> INF (Sanctum Infinity)`;
      protocol = "Sanctum INF"; inputToken = "SOL"; inputAmount = args.amount_sol; outputToken = "INF";
      break;
    case "sanctum_unstake_inf":
      action = `Unstake ${args.amount_inf} INF -> SOL`;
      protocol = "Sanctum INF"; inputToken = "INF"; inputAmount = args.amount_inf; outputToken = "SOL";
      break;
    case "sanctum_lst_swap":
      action = `Swap ${args.amount} ${args.input_token} -> ${args.output_token} via Sanctum`;
      protocol = "Sanctum Router"; inputToken = args.input_token; inputAmount = args.amount; outputToken = args.output_token;
      break;
    case "jupiter_lend_deposit":
      action = `Deposit ${args.amount} ${args.token} into Jupiter Earn`;
      protocol = "Jupiter Lend"; inputToken = args.token; inputAmount = args.amount;
      break;
    case "jupiter_lend_withdraw":
      action = `Withdraw ${args.amount} ${args.token} from Jupiter Earn`;
      protocol = "Jupiter Lend"; inputToken = args.token; inputAmount = args.amount;
      break;
    case "marginfi_deposit":
      action = `Deposit ${args.amount} ${args.token} into marginfi`;
      protocol = "marginfi"; inputToken = args.token; inputAmount = args.amount;
      break;
    case "marginfi_withdraw":
      action = `Withdraw ${args.amount} ${args.token} from marginfi`;
      protocol = "marginfi"; inputToken = args.token; inputAmount = args.amount;
      break;
    case "marginfi_borrow":
      action = `Borrow ${args.amount} ${args.token} from marginfi`;
      protocol = "marginfi"; inputToken = args.token; inputAmount = args.amount;
      break;
    case "enter_susde":
      action = `Swap ${args.amount} USDC -> sUSDe (Ethena)`;
      protocol = "Ethena / Jupiter"; inputToken = "USDC"; inputAmount = args.amount; outputToken = "sUSDe";
      break;
    case "exit_susde":
      action = `Swap ${args.amount} sUSDe -> USDC`;
      protocol = "Ethena / Jupiter"; inputToken = "sUSDe"; inputAmount = args.amount; outputToken = "USDC";
      break;
    case "enter_usdy":
      action = `Swap ${args.amount} USDC -> USDY (Ondo)`;
      protocol = "Ondo / Jupiter"; inputToken = "USDC"; inputAmount = args.amount; outputToken = "USDY";
      break;
    case "exit_usdy":
      action = `Swap ${args.amount} USDY -> USDC`;
      protocol = "Ondo / Jupiter"; inputToken = "USDY"; inputAmount = args.amount; outputToken = "USDC";
      break;
    default:
      action = toolName.replace(/_/g, " ");
      protocol = "Sandbox";
  }

  return {
    type: "transaction_preview",
    sandbox: true,
    action,
    protocol,
    serializedTx: "SANDBOX_PLACEHOLDER",
    inputToken:  inputToken  ?? null,
    inputAmount: inputAmount ?? null,
    outputToken: outputToken ?? null,
    requiresApproval: true,
  };
}

// --- Tool executor ----------------------------------------------------------

async function executeTool(toolCall, walletContext) {
  const { name, arguments: rawArgs } = toolCall.function;
  const args = JSON.parse(rawArgs);
  const network = walletContext.network || "mainnet";

  // --- SANDBOX MODE: return stub for tx tools - no real blockchain calls ---
  if (walletContext.sandboxMode && TRANSACTION_TOOLS.has(name)) {
    return buildSandboxTxStub(name, args);
  }

  switch (name) {
    case "get_portfolio": {
      // In sandbox, return the virtual portfolio instead of fetching on-chain
      if (walletContext.sandboxMode && walletContext.sandboxVirtualBalances) {
        const vb = walletContext.sandboxVirtualBalances;
        return {
          solBalance: vb.SOL ?? 0,
          tokens: Object.entries(vb)
            .filter(([k]) => k !== "SOL")
            .map(([symbol, balance]) => ({ symbol, balance, usdValue: null })),
          source: "sandbox_virtual",
          note: "This is your virtual sandbox portfolio - not your real on-chain wallet.",
        };
      }
      return await fetchPortfolio(args.wallet || walletContext.walletAddress, network);
    }

    case "get_yield_rates": {
      const rates = await fetchLiveRates();
      if (rates?.sol_price_usd) _cachedSolPrice = rates.sol_price_usd;
      return rates;
    }

    case "get_market_data": {
      return await fetchMarketContext();
    }

    case "prepare_stake_transaction": {
      const pre = preflightBalance(name, args, walletContext);
      if (pre.__preflight_failed) return pre;
      const result = await buildMarinadeStakeTx(args.amount_sol, args.wallet, network);
      if (result && !result.error) result.requiresApproval = true;
      return attachRisk(result, "Marinade Finance", "stake", Number(args.amount_sol) * _cachedSolPrice);
    }

    case "prepare_swap_transaction": {
      const pre = preflightBalance(name, args, walletContext);
      if (pre.__preflight_failed) return pre;
      const result = await buildJupiterSwapTx(
        args.input_token,
        args.output_token,
        args.amount,
        args.wallet,
        network
      );
      if (result && !result.error) result.requiresApproval = true;
      const swapAmountUsd = (args.input_token || "").toUpperCase() === "SOL"
        ? Number(args.amount) * _cachedSolPrice
        : Number(args.amount); // token amount — rough USD proxy
      return attachRisk(result, "Jupiter", "swap", swapAmountUsd);
    }

    case "prepare_lend_transaction": {
      const pre = preflightBalance(name, args, walletContext);
      if (pre.__preflight_failed) return pre;
      const result = await buildKaminoLendTx(args.token, args.amount, args.wallet, network);
      if (result && !result.error) result.requiresApproval = true;
      const lendAmountUsd = (args.token || "").toUpperCase() === "SOL"
        ? Number(args.amount) * _cachedSolPrice
        : Number(args.amount);
      return attachRisk(result, "Kamino Lend", "lend", lendAmountUsd);
    }

    case "prepare_unstake_transaction": {
      const result = await buildMarinadeUnstakeTx(args.amount_msol, args.wallet, network);
      if (result && !result.error) result.requiresApproval = true;
      return attachRisk(result, "Marinade Finance", "unstake", Number(args.amount_msol) * _cachedSolPrice);
    }

    case "prepare_withdraw_transaction": {
      const result = await buildKaminoWithdrawTx(args.token, args.amount, args.wallet, network);
      if (result && !result.error) result.requiresApproval = true;
      const withdrawAmountUsd = (args.token || "").toUpperCase() === "SOL"
        ? Number(args.amount) * _cachedSolPrice
        : Number(args.amount);
      return attachRisk(result, "Kamino Lend", "withdraw", withdrawAmountUsd);
    }

    case "get_pool_risks": {
      const minScore       = args.min_score ?? 0;
      const protocolFilter = args.protocol ? args.protocol.toLowerCase() : null;
      const actionFilter   = args.action   ? args.action.toLowerCase()   : null;
      // When filtering by protocol, default limit to 50 so all pools show
      const defaultLimit   = protocolFilter ? 50 : 10;
      const limit          = Math.min(args.limit ?? defaultLimit, 100);
      const rates          = await fetchLiveRates();

      // Fetch live pools - fall back to rates-derived pools if APIs are down
      let pools = await fetchAllPools();
      if (pools.length === 0) pools = buildFallbackPools(rates);

      const analyses = analyseAllPools(pools)
        .filter((a) => {
          if (a.score < minScore) return false;
          if (protocolFilter && !a.pool.protocol?.toLowerCase().includes(protocolFilter)) return false;
          if (actionFilter   && a.pool.action !== actionFilter) return false;
          return true;
        })
        .slice(0, limit)
        .map((a) => ({
          pair:         a.pool.pair,
          protocol:     a.pool.protocol,
          apy:          a.pool.apy,
          tvlUsd:       a.pool.tvl,
          score:        a.score,
          risk:         a.risk,
          label:        a.label,
          rewardSource: a.pool.rewardSource,
          action:       a.pool.action,
          topReason:    a.reasons[0] ?? null,
          warnings:     a.warnings.slice(0, 2),
          isScam:       a.scam.isScam,
        }));

      return { count: analyses.length, pools: analyses, ratesSnapshot: rates };
    }

    case "suggest_strategy": {
      const rates = await fetchLiveRates();
      let pools   = await fetchAllPools();
      if (pools.length === 0) pools = buildFallbackPools(rates);

      const plan = suggestStrategy(
        Number(args.balance_usd),
        args.risk_preference,
        pools,
        rates,
      );
      return plan;
    }

    case "search_news": {
      return await searchNews(args.query);
    }

    case "lookup_token": {
      await loadTokenRegistry();
      const q = (args.query || "").trim();

      // Strip noise words for cleaner searches ("pengu coin" -> "pengu")
      const noiseWords = new Set(["coin", "token", "protocol", "finance", "swap", "the"]);
      const cleanQuery = q.split(/\s+/)
        .filter((w) => !noiseWords.has(w.toLowerCase()))
        .join(" ") || q;

      // 1. Exact symbol or mint address in local registry
      const exact = getToken(q) || (cleanQuery !== q ? getToken(cleanQuery) : null);
      if (exact) {
        return { found: true, results: [{ symbol: (cleanQuery || q).toUpperCase(), ...exact }] };
      }

      // 2. Fuzzy search in local registry (verified tokens)
      const local = searchToken(cleanQuery, 5);
      if (local.length > 0) {
        return { found: true, results: local };
      }

      // 3. Live search via Jupiter v2 API - covers ALL tokens including new/niche ones
      const live = await searchTokenLive(cleanQuery, 5);
      if (live.length > 0) {
        return { found: true, results: live };
      }

      return { found: false, message: `No token found matching "${q}". It may not be tradable on Jupiter yet.` };
    }

    case "get_token_chart": {
      const chartData = await fetchTokenChart(args.token);
      if (!chartData) {
        return { error: `Could not fetch chart data for ${args.token}. Token may not be indexed yet.` };
      }
      return chartData;
    }

    case "prepare_orca_lp_transaction": {
      const result = await buildOrcaOpenLpTx({
        tokenA: args.tokenA,
        tokenB: args.tokenB,
        amountA: Number(args.amountA),
        walletAddress: walletContext.walletAddress,
        network: walletContext.network || "mainnet",
      });
      const orcaAmountUsd = (args.tokenA || "").toUpperCase() === "SOL"
        ? Number(args.amountA) * _cachedSolPrice
        : Number(args.amountA);
      return attachRisk({
        type: "transaction_preview",
        protocol: "Orca Whirlpools",
        action: `Open ${args.tokenA}-${args.tokenB} LP position (full range)`,
        serializedTx: result.serializedTx,
        estimatedOutput: result.estimatedOutput,
        fee: result.fee,
        requiresApproval: true,
        note: result.note,
      }, "Orca Whirlpools", "lp", orcaAmountUsd);
    }

    case "harvest_orca_position": {
      const result = await buildOrcaHarvestTx(
        args.positionMint,
        walletContext.walletAddress,
        walletContext.network || "mainnet",
      );
      return {
        type: "transaction_preview",
        protocol: "Orca Whirlpools",
        action: "Harvest LP fees and rewards",
        serializedTx: result.serializedTx,
        estimatedOutput: result.estimatedOutput,
        fee: result.fee,
        requiresApproval: true,
      };
    }

    case "close_orca_position": {
      const result = await buildOrcaCloseLpTx(
        args.positionMint,
        walletContext.walletAddress,
        walletContext.network || "mainnet",
      );
      return {
        type: "transaction_preview",
        protocol: "Orca Whirlpools",
        action: "Close LP position - withdraw all liquidity",
        serializedTx: result.serializedTx,
        estimatedOutput: result.estimatedOutput,
        fee: result.fee,
        requiresApproval: true,
      };
    }

    case "get_orca_positions": {
      const positions = await fetchOrcaPositions(
        walletContext.walletAddress,
        walletContext.network || "mainnet",
      );
      return { count: positions.length, positions };
    }

    // --- Jupiter DCA ------------------------------------------------------------

    case "create_dca_order": {
      const result = await buildDcaOrderTx({
        inputToken:     args.inputToken,
        outputToken:    args.outputToken,
        amountPerCycle: Number(args.amountPerCycle),
        intervalStr:    args.intervalStr,
        cycles:         args.cycles ? Number(args.cycles) : undefined,
        walletAddress:  walletContext.walletAddress,
        network:        walletContext.network || "mainnet",
      });
      const cycles = args.cycles ? Number(args.cycles) : 1;
      const dcaTotalUsd = (args.inputToken || "").toUpperCase() === "SOL"
        ? Number(args.amountPerCycle) * cycles * _cachedSolPrice
        : Number(args.amountPerCycle) * cycles;
      return attachRisk(result, "Jupiter", "dca", dcaTotalUsd);
    }

    case "get_dca_orders": {
      return await getDcaOrders(walletContext.walletAddress);
    }

    case "cancel_dca_order": {
      return await cancelDcaOrderTx(args.orderAddress, walletContext.walletAddress);
    }

    // --- Jupiter Limit / Trigger Orders -----------------------------------------

    case "create_limit_order": {
      const result = await buildLimitOrderTx({
        inputToken:   args.inputToken,
        outputToken:  args.outputToken,
        inputAmount:  Number(args.inputAmount),
        triggerPrice: Number(args.triggerPrice),
        expireIn:     args.expireIn,
        walletAddress: walletContext.walletAddress,
        network:      walletContext.network || "mainnet",
      });
      const limitAmountUsd = (args.inputToken || "").toUpperCase() === "SOL"
        ? Number(args.inputAmount) * _cachedSolPrice
        : Number(args.inputAmount);
      return attachRisk(result, "Jupiter", "limit_order", limitAmountUsd);
    }

    case "create_oco_order": {
      const result = await buildOcoOrderTx({
        holdingToken:    args.holdingToken,
        quoteToken:      args.quoteToken,
        holdingAmount:   Number(args.holdingAmount),
        takeProfitPrice: Number(args.takeProfitPrice),
        stopLossPrice:   Number(args.stopLossPrice),
        walletAddress:   walletContext.walletAddress,
        network:         walletContext.network || "mainnet",
      });
      const ocoAmountUsd = (args.holdingToken || "").toUpperCase() === "SOL"
        ? Number(args.holdingAmount) * _cachedSolPrice
        : Number(args.holdingAmount);
      return attachRisk(result, "Jupiter", "limit_order", ocoAmountUsd);
    }

    case "get_limit_orders": {
      return await getLimitOrders(walletContext.walletAddress);
    }

    case "cancel_limit_order": {
      return await cancelLimitOrderTx(args.orderAddress, walletContext.walletAddress);
    }

    // --- Kamino Leverage / Multiply ---------------------------------------------

    case "open_kamino_leverage": {
      const pre = preflightBalance(name, args, walletContext);
      if (pre.__preflight_failed) return pre;

      const result = await buildKaminoOpenLeverageTx({
        collToken:      args.collToken,
        debtToken:      args.debtToken,
        depositAmount:  Number(args.depositAmount),
        targetLeverage: Number(args.targetLeverage),
        walletAddress:  walletContext.walletAddress,
        network:        walletContext.network || "mainnet",
      });

      // Attach liquidation price so agent can surface it to the user
      if (result && !result.error) {
        const lev = Number(args.targetLeverage);
        // For correlated pairs (mSOL--SOL) health stays stable - no liq price
        const CORRELATED = ["msol", "jitosol", "bsol"];
        const isCorrelated = CORRELATED.some((t) => (args.collToken || "").toLowerCase().includes(t));
        if (!isCorrelated) {
          const rates = await fetchLiveRates().catch(() => null);
          const entryPrice = rates?.sol_price_usd ?? 0;
          result.liquidationPrice = calcLiquidationPrice(entryPrice, lev);
          result.entryPrice = entryPrice;
        }
        result.requiresApproval = true;
      }
      const levAmountUsd = (args.collToken || "").toUpperCase() === "SOL" || (args.collToken || "").toLowerCase().includes("sol")
        ? Number(args.depositAmount) * _cachedSolPrice
        : Number(args.depositAmount);
      return attachRisk(result, "Kamino Finance", "leverage", levAmountUsd);
    }

    case "close_kamino_leverage": {
      const result = await buildKaminoCloseLeverageTx({
        collToken:   args.collToken,
        debtToken:   args.debtToken,
        withdrawPct: args.withdrawPct != null ? Number(args.withdrawPct) : 100,
        walletAddress: walletContext.walletAddress,
        network:     walletContext.network || "mainnet",
      });
      return result;
    }

    case "list_leverage_vaults": {
      return await fetchLeverageVaults();
    }

    // --- Meteora DLMM -----------------------------------------------------------

    case "meteora_open_dlmm": {
      return await buildMeteoraOpenDlmmTx({
        poolAddress:  args.poolAddress,
        tokenX:       args.tokenX,
        tokenY:       args.tokenY,
        amountX:      Number(args.amountX),
        amountY:      args.amountY != null ? Number(args.amountY) : 0,
        strategy:     args.strategy ?? "Spot",
        walletAddress: walletContext.walletAddress,
        network:      walletContext.network || "mainnet",
      });
    }

    case "meteora_remove_liquidity": {
      return await buildMeteoraRemoveLiquidityTx({
        poolAddress:     args.poolAddress,
        positionAddress: args.positionAddress,
        bps:             args.bps != null ? Number(args.bps) : 10000,
        walletAddress:   walletContext.walletAddress,
        network:         walletContext.network || "mainnet",
      });
    }

    case "meteora_claim_fees": {
      return await buildMeteoraClaimFeesTx({
        poolAddress:     args.poolAddress,
        positionAddress: args.positionAddress,
        walletAddress:   walletContext.walletAddress,
        network:         walletContext.network || "mainnet",
      });
    }

    case "meteora_claim_rewards": {
      return await buildMeteoraClaimRewardsTx({
        poolAddress:     args.poolAddress,
        positionAddress: args.positionAddress,
        walletAddress:   walletContext.walletAddress,
        network:         walletContext.network || "mainnet",
      });
    }

    case "meteora_vault_deposit": {
      return await buildMeteoraVaultDepositTx({
        token:         args.token,
        amount:        Number(args.amount),
        walletAddress: walletContext.walletAddress,
        network:       walletContext.network || "mainnet",
      });
    }

    case "meteora_vault_withdraw": {
      return await buildMeteoraVaultWithdrawTx({
        token:         args.token,
        amount:        Number(args.amount),
        walletAddress: walletContext.walletAddress,
        network:       walletContext.network || "mainnet",
      });
    }

    case "meteora_get_positions": {
      return await fetchMeteoraUserPositions(
        walletContext.walletAddress,
        walletContext.network || "mainnet",
      );
    }

    case "lookup_wallet": {
      const input = (args.address_or_domain || "").trim();
      let resolved;
      try {
        resolved = await resolveSnsAddress(input);
      } catch (err) {
        return { error: err.message };
      }
      try {
        const portfolio = await fetchPortfolio(resolved.address, network);
        return {
          query: input,
          resolvedAddress: resolved.address,
          domains: resolved.domains,
          ...portfolio,
        };
      } catch (err) {
        return {
          query: input,
          resolvedAddress: resolved.address,
          domains: resolved.domains,
          error: `Resolved address but portfolio fetch failed: ${err.message}`,
        };
      }
    }

    // --- Orca / Meteora pool APR ------------------------------------------

    case "get_orca_pools": {
      try {
        if (args.tokenA && args.tokenB) {
          const pools = await fetchOrcaPoolsForPair(args.tokenA, args.tokenB);
          return { count: pools.length, pools };
        }
        const pools = await fetchOrcaTopPools(10);
        return { count: pools.length, pools };
      } catch (e) {
        return { error: e.message };
      }
    }

    case "get_meteora_pools": {
      try {
        if (args.tokenA && args.tokenB) {
          const pools = await fetchMeteoraPoolsForPair(args.tokenA, args.tokenB);
          return { count: pools.length, pools };
        }
        const pools = await fetchMeteoraTopPools(10);
        return { count: pools.length, pools };
      } catch (e) {
        return { error: e.message };
      }
    }

    // --- LP Rebalance Bundle -----------------------------------------------

    case "rebalance_lp": {
      try {
        const proto = (args.protocol || "orca").toLowerCase();
        if (proto === "meteora") {
          const bundle = await buildMeteoraRebalanceBundleTx({
            poolAddress:       args.poolAddress,
            positionAddress:   args.positionAddress,
            tokenA:            args.tokenA || "SOL",
            tokenB:            args.tokenB || "USDC",
            positionAmountUsd: args.positionAmountUsd || 200,
            walletAddress,
            network,
          });
          return bundle;
        }
        // Default: Orca
        const bundle = await buildOrcaRebalanceBundleTx({
          positionMint:      args.positionMint,
          tokenA:            args.tokenA || "SOL",
          tokenB:            args.tokenB || "USDC",
          positionAmountUsd: args.positionAmountUsd || 200,
          rangePct:          args.rangePct,
          walletAddress,
          network,
        });
        // Log as a pending agent suggestion
        logActivity(walletAddress, {
          type:     "suggestion",
          protocol: bundle.protocol,
          action:   bundle.title,
          amountUsd: args.positionAmountUsd || null,
          reason:   bundle.why,
          status:   "pending",
          autoExecuted: false,
        });
        return bundle;
      } catch (e) {
        return { error: e.message };
      }
    }

    // --- Raydium LP -------------------------------------------------------

    case "raydium_get_pools": {
      try {
        const pools = await fetchRaydiumPools(args.tokenA, args.tokenB);
        return { count: pools.length, pools };
      } catch (e) {
        return { error: e.message };
      }
    }

    case "raydium_add_lp": {
      if (walletContext.sandboxMode) {
        return {
          serializedTx: "SANDBOX_PLACEHOLDER",
          action: `Add ${args.amountA} ${args.tokenA} to Raydium ${args.tokenA}-${args.tokenB} pool`,
          tokenA: args.tokenA, tokenB: args.tokenB, amountA: args.amountA,
          protocol: "Raydium CPMM", requiresApproval: true,
        };
      }
      return await buildRaydiumAddLpTx({
        tokenA: args.tokenA, tokenB: args.tokenB,
        amountA: Number(args.amountA),
        walletAddress: walletContext.walletAddress,
        network: walletContext.network || "mainnet",
      });
    }

    case "raydium_remove_lp": {
      if (walletContext.sandboxMode) {
        return {
          serializedTx: "SANDBOX_PLACEHOLDER",
          action: `Remove ${args.lpAmount} LP from Raydium pool ${args.poolId}`,
          poolId: args.poolId, lpAmount: args.lpAmount,
          protocol: "Raydium CPMM", requiresApproval: true,
        };
      }
      return await buildRaydiumRemoveLpTx({
        poolId: args.poolId, lpAmount: Number(args.lpAmount),
        walletAddress: walletContext.walletAddress,
        network: walletContext.network || "mainnet",
      });
    }

    case "raydium_get_positions": {
      const positions = await fetchRaydiumPositions(walletContext.walletAddress);
      return { count: positions.length, positions };
    }

    case "get_jupiter_perps_markets": {
      if (args.symbol) {
        try {
          return await fetchJupPerpsAsset(args.symbol.toUpperCase());
        } catch (e) {
          return { error: e.message };
        }
      }
      return { markets: await fetchJupPerpsMarkets() };
    }

    case "build_perp_strategy": {
      return await buildJupPerpStrategy({
        symbol:    args.symbol,
        direction: args.direction,
        amountUsd: Number(args.amountUsd),
        leverage:  args.leverage ? Number(args.leverage) : 5,
      });
    }

    case "get_kamino_cash_vault": {
      const vault = await fetchPrimaryCashVault();
      if (!vault) return { error: "Kamino CASH vault data unavailable right now." };
      return vault;
    }

    case "kamino_cash_deposit": {
      return await buildKaminoCashDepositTx(
        args.token, Number(args.amount), args.wallet, network,
      );
    }

    case "kamino_cash_withdraw": {
      return await buildKaminoCashWithdrawTx(
        args.token, Number(args.amount), args.wallet, network,
      );
    }

    case "get_sentiment": {
      const result = await getSentiment(
        (args.symbol || "").toUpperCase(),
        args.mint || null,
      );
      return result;
    }

    case "stress_test_portfolio": {
      const [portfolio, rates] = await Promise.all([
        fetchPortfolio(walletContext.walletAddress, network),
        fetchLiveRates().catch(() => null),
      ]);

      const currentSolPrice = rates?.sol_price_usd ?? 0;
      if (currentSolPrice <= 0) return { error: "Couldn't fetch SOL price right now - try again in a moment." };

      // Resolve target price
      let simulatedPrice;
      if (args.targetPrice > 0) {
        simulatedPrice = args.targetPrice;
      } else {
        const movePct = args.solMovePct ?? -40;
        simulatedPrice = currentSolPrice * (1 + movePct / 100);
      }
      simulatedPrice = Math.max(0.01, simulatedPrice);
      const priceFactor = simulatedPrice / currentSolPrice;
      const movePct     = ((simulatedPrice - currentSolPrice) / currentSolPrice * 100).toFixed(1);

      const solBalance  = portfolio.solBalance ?? 0;
      const tokens      = portfolio.tokens ?? [];

      // Classify tokens into buckets and apply price factor
      const mSolBalance = tokens.find((t) => t.symbol === "mSOL")?.balance ?? 0;
      const kTokensUsd  = tokens.filter((t) => t.symbol?.startsWith("k") && t.symbol !== "kSOL")
        .reduce((s, t) => s + (t.usdValue ?? 0), 0);
      const otherUsd    = tokens
        .filter((t) => t.symbol !== "mSOL" && !t.symbol?.startsWith("k"))
        .reduce((s, t) => s + (t.usdValue ?? 0), 0);

      // Current values
      const currentSolUsd   = solBalance * currentSolPrice;
      const currentMSolUsd  = mSolBalance * currentSolPrice;
      const currentTotal    = currentSolUsd + currentMSolUsd + kTokensUsd + otherUsd;

      // Simulated values (SOL and mSOL move with price, stablecoins and kUSDC don't)
      const simSolUsd   = solBalance * simulatedPrice;
      const simMSolUsd  = mSolBalance * simulatedPrice;
      const simTotal    = simSolUsd + simMSolUsd + kTokensUsd + otherUsd;
      const simChange   = simTotal - currentTotal;
      const simChangePct = currentTotal > 0 ? (simChange / currentTotal * 100).toFixed(1) : "0";

      // Leverage liquidation check
      const leverageAlerts = [];
      if (rates?.sol_price_usd) {
        for (const pos of (portfolio.tokens ?? []).filter((t) => t._isLeveraged)) {
          const liq = calcLiquidationPrice(currentSolPrice, pos._leverage ?? 2);
          if (liq && simulatedPrice <= liq) {
            leverageAlerts.push({ token: pos.symbol, liquidationPrice: liq, leverage: pos._leverage });
          }
        }
      }

      return {
        currentSolPrice: +currentSolPrice.toFixed(2),
        simulatedPrice:  +simulatedPrice.toFixed(2),
        movePct:         +movePct,
        currentTotal:    +currentTotal.toFixed(2),
        simulatedTotal:  +simTotal.toFixed(2),
        changeUsd:       +simChange.toFixed(2),
        changePct:       +simChangePct,
        breakdown: {
          liquid:  { current: +currentSolUsd.toFixed(2),  simulated: +simSolUsd.toFixed(2)  },
          staked:  { current: +currentMSolUsd.toFixed(2), simulated: +simMSolUsd.toFixed(2) },
          lending: { current: +kTokensUsd.toFixed(2),     simulated: +kTokensUsd.toFixed(2) },
          other:   { current: +otherUsd.toFixed(2),       simulated: +otherUsd.toFixed(2)   },
        },
        leverageAlerts,
        stablecoinsProtected: +kTokensUsd.toFixed(2),
      };
    }

    case "suggest_rebalance": {
      // Determine target strategy
      const REBALANCE_TARGETS = {
        yield:        { liquid: 10, staked: 60, lending: 30 },
        balanced:     { liquid: 40, staked: 40, lending: 20 },
        preservation: { liquid: 70, staked: 20, lending: 10 },
        aggressive:   { liquid: 5,  staked: 70, lending: 25 },
      };

      const stratId = args.strategyId
        || walletContext.autopilotConfig?.strategyId
        || "balanced";

      const targets = REBALANCE_TARGETS[stratId] ?? REBALANCE_TARGETS.balanced;
      const threshold = args.driftThreshold ?? walletContext.autopilotConfig?.driftThreshold ?? 8;

      // Fetch fresh portfolio and SOL price in parallel
      const [portfolio, rates] = await Promise.all([
        fetchPortfolio(walletContext.walletAddress, network),
        fetchLiveRates().catch(() => null),
      ]);

      const solPrice = rates?.sol_price_usd ?? 0;

      const plan = computeRebalancePlan(portfolio, solPrice, targets, threshold);

      return {
        strategyId: stratId,
        strategyName: { yield: "Yield Farmer", balanced: "Balanced", preservation: "Capital Safe", aggressive: "Max Yield" }[stratId],
        ...plan,
      };
    }

    // ── Jito ──────────────────────────────────────────────────────────────────

    case "jito_stake": {
      const pre = preflightBalance("prepare_stake_transaction", { amount_sol: args.amount_sol }, walletContext);
      if (pre.__preflight_failed) return pre;
      const result = await buildJitoStakeTx(args.amount_sol, args.wallet, network);
      if (result && !result.error) result.requiresApproval = true;
      return result;
    }

    case "jito_unstake": {
      const result = await buildJitoUnstakeTx(args.amount_jitosol, args.wallet, network);
      if (result && !result.error) result.requiresApproval = true;
      return result;
    }

    case "get_jito_data": {
      return await fetchJitoData();
    }

    // ── Sanctum ──────────────────────────────────────────────────────────────

    case "sanctum_stake_inf": {
      const pre = preflightBalance("prepare_stake_transaction", { amount_sol: args.amount_sol }, walletContext);
      if (pre.__preflight_failed) return pre;
      const result = await buildSanctumStakeInfTx(args.amount_sol, args.wallet, network);
      if (result && !result.error) result.requiresApproval = true;
      return result;
    }

    case "sanctum_unstake_inf": {
      const result = await buildSanctumUnstakeInfTx(args.amount_inf, args.wallet, network);
      if (result && !result.error) result.requiresApproval = true;
      return result;
    }

    case "sanctum_lst_swap": {
      const result = await buildSanctumLstSwapTx(
        args.input_token,
        args.output_token,
        args.amount,
        args.wallet,
        network,
      );
      if (result && !result.error) result.requiresApproval = true;
      return result;
    }

    case "get_sanctum_data": {
      return await fetchSanctumData();
    }

    case "get_sanctum_lsts": {
      return await fetchSanctumLstList();
    }

    // -- Jupiter Lend ------------------------------------------------------------

    case "get_jupiter_lend_data": {
      return await fetchJupiterLendData();
    }

    case "jupiter_lend_deposit": {
      const pre = preflightBalance("jupiter_lend_deposit", args, walletContext);
      if (pre.__preflight_failed) return pre;
      const result = await buildJupiterLendDepositTx(args.token, Number(args.amount), args.wallet, network);
      if (result && !result.error) result.requiresApproval = true;
      return result;
    }

    case "jupiter_lend_withdraw": {
      const result = await buildJupiterLendWithdrawTx(args.token, Number(args.amount), args.wallet, network);
      if (result && !result.error) result.requiresApproval = true;
      return result;
    }

    // -- marginfi ---------------------------------------------------------------

    case "get_marginfi_data": {
      return await fetchMarginfiData();
    }

    case "marginfi_deposit": {
      const pre = preflightBalance("marginfi_deposit", args, walletContext);
      if (pre.__preflight_failed) return pre;
      const result = await buildMarginfiDepositTx(args.token, Number(args.amount), args.wallet, network);
      if (result && !result.error) result.requiresApproval = true;
      return result;
    }

    case "marginfi_withdraw": {
      const result = await buildMarginfiWithdrawTx(args.token, Number(args.amount), args.wallet, network);
      if (result && !result.error) result.requiresApproval = true;
      return result;
    }

    case "marginfi_borrow": {
      const result = await buildMarginfiBorrowTx(args.token, Number(args.amount), args.wallet, network);
      if (result && !result.error) result.requiresApproval = true;
      return result;
    }

    // -- Lending health + IL ------------------------------------------------------

    case "get_lending_health": {
      try {
        const obligations = await fetchKaminoObligations(walletAddress);
        if (obligations.length === 0) {
          return { message: "No active Kamino borrow positions found. Either you have no open borrows, or your wallet has supply-only positions (no debt)." };
        }
        return { protocol: "Kamino Finance", obligations };
      } catch (e) {
        return { error: `Could not fetch lending health: ${e.message}` };
      }
    }

    case "calculate_il": {
      const entryP   = Number(args.entry_price);
      const currentP = Number(args.current_price);
      if (entryP <= 0 || currentP <= 0) return { error: "entry_price and current_price must be positive numbers" };
      const k      = currentP / entryP;
      const ilFrac = (2 * Math.sqrt(k) / (1 + k)) - 1; // negative = loss
      const ilPct  = +(ilFrac * 100).toFixed(3);
      const result = {
        entry_price:   entryP,
        current_price: currentP,
        price_change_pct: +((k - 1) * 100).toFixed(2),
        il_pct:        ilPct,
        il_interpretation: ilPct === 0 ? "No IL — price unchanged"
          : `${Math.abs(ilPct).toFixed(2)}% loss vs simply holding both tokens (HODL)`,
      };
      if (args.position_value_usd) {
        const posVal = Number(args.position_value_usd);
        result.il_dollar_amount = +(posVal * Math.abs(ilFrac)).toFixed(2);
        result.hodl_value_usd   = +(posVal / (1 + ilFrac)).toFixed(2);
      }
      return result;
    }

    // -- Ethena sUSDe -----------------------------------------------------------

    case "get_susde_data": {
      return await fetchEthenaData();
    }

    case "enter_susde": {
      const pre = preflightBalance("prepare_swap_transaction", { input_token: "USDC", amount: args.amount }, walletContext);
      if (pre.__preflight_failed) return pre;
      const result = await buildJupiterSwapTx("USDC", "sUSDe", Number(args.amount), args.wallet, network);
      if (result && !result.error) result.requiresApproval = true;
      return result;
    }

    case "exit_susde": {
      const result = await buildJupiterSwapTx("sUSDe", "USDC", Number(args.amount), args.wallet, network);
      if (result && !result.error) result.requiresApproval = true;
      return result;
    }

    // -- Ondo USDY --------------------------------------------------------------

    case "get_usdy_data": {
      return await fetchOndoData();
    }

    case "enter_usdy": {
      const pre = preflightBalance("prepare_swap_transaction", { input_token: "USDC", amount: args.amount }, walletContext);
      if (pre.__preflight_failed) return pre;
      const result = await buildJupiterSwapTx("USDC", "USDY", Number(args.amount), args.wallet, network);
      if (result && !result.error) result.requiresApproval = true;
      return result;
    }

    case "exit_usdy": {
      const result = await buildJupiterSwapTx("USDY", "USDC", Number(args.amount), args.wallet, network);
      if (result && !result.error) result.requiresApproval = true;
      return result;
    }

    case "project_portfolio": {
      return await projectYield({
        amountSol: args.amountSol != null ? Number(args.amountSol) : undefined,
        amountUsd: args.amountUsd != null ? Number(args.amountUsd) : undefined,
        apy:       Number(args.apy),
        protocol:  String(args.protocol),
        action:    String(args.action),
        days:      Number(args.days) as 30 | 60 | 90,
      });
    }

    case "compile_plan": {
      const plan = compilePlan({
        title:         String(args.title),
        why:           args.why ? String(args.why) : undefined,
        narrativeLevel: (args.narrativeLevel as any) || "brief",
        estimatedGas:  args.estimatedGas ? String(args.estimatedGas) : undefined,
        steps:         Array.isArray(args.steps) ? args.steps : [],
      });
      return plan;
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// â"€â"€â"€ Live context builders â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function buildLiveRatesCtx(rates: any): string {
  if (!rates) return "";
  const lines: string[] = [];

  const staking = [
    rates.jitosol_apy   != null && `jitoSOL: ${rates.jitosol_apy}%`,
    rates.marinade_apy  != null && `mSOL: ${rates.marinade_apy}%`,
    rates.sanctum_inf_apy != null && `INF: ${rates.sanctum_inf_apy}%`,
  ].filter(Boolean);
  if (staking.length) lines.push(`Staking APYs — ${staking.join(", ")}`);

  const solLend = [
    rates.jup_lend_sol_apy       != null && `Jupiter Lend: ${rates.jup_lend_sol_apy}%`,
    rates.kamino_sol_lending_apy != null && `Kamino: ${rates.kamino_sol_lending_apy}%`,
    rates.marginfi_sol_supply_apy != null && `marginfi: ${rates.marginfi_sol_supply_apy}%`,
  ].filter(Boolean);
  if (solLend.length) lines.push(`SOL Lending APYs — ${solLend.join(", ")}`);

  const stable = [
    rates.susde_apy              != null && `sUSDe: ${rates.susde_apy}%`,
    rates.usdy_apy               != null && `USDY: ${rates.usdy_apy}%`,
    rates.jup_lend_usdc_apy      != null && `Jupiter Lend USDC: ${rates.jup_lend_usdc_apy}%`,
    rates.kamino_usdc_lending_apy != null && `Kamino USDC: ${rates.kamino_usdc_lending_apy}%`,
  ].filter(Boolean);
  if (stable.length) lines.push(`Stablecoin APYs — ${stable.join(", ")}`);

  if (rates.sol_price_usd != null) lines.push(`SOL price: $${rates.sol_price_usd}`);

  if (!lines.length) return "";
  return `\n\nLIVE RATES (fetched right now — always use these numbers, never invent APYs):\n${lines.join("\n")}`;
}

function buildIdleCtx(solBalance: number | null | undefined, rates: any): string {
  const sol = Number(solBalance ?? 0);
  if (sol < 1 || !rates) return "";

  const candidates: number[] = [
    rates.jitosol_apy,
    rates.marinade_apy,
    rates.sanctum_inf_apy,
  ].filter((v): v is number => v != null);
  if (!candidates.length) return "";

  const bestApy = Math.max(...candidates);
  const dailySol = (sol * bestApy) / 100 / 365;
  const solPrice = typeof rates.sol_price_usd === "number" ? rates.sol_price_usd : 0;
  const dailyUsd = solPrice > 0 ? ` (~$${(dailySol * solPrice).toFixed(2)}/day)` : "";

  return `\n\nIDLE SOL ALERT: User has ${sol.toFixed(2)} SOL sitting unstaked in their wallet. At the current best staking APY (${bestApy}%), they are missing ${dailySol.toFixed(4)} SOL${dailyUsd} every day. Proactively mention this when it's relevant to the conversation.`;
}

function buildModeCtx(tradeMode: string | undefined): string {
  if (tradeMode === "learn") {
    return `\n\nMODE: LEARN — This user wants maximum context. Rules:
- BEFORE every execution: 1 sentence using their exact numbers (e.g. "You're about to stake 2.4 SOL with Marinade — you'll get ~2.4 mSOL earning ${"{"}LIVE_APY{"}"}% APY, worth ~$X/year"). Use live rates from context, not invented numbers.
- Explain jargon terms inline in brackets: [mSOL: the liquid token you get for staking SOL with Marinade].
- AFTER execution (when message starts with __post_tx__): narrate what changed + what they now earn per month.
- Call project_portfolio when presenting a strategy — always show the 90-day projection.
- Keep each explanation to 1-2 sentences — brief and grounded, not a lecture.`;
  }
  if (tradeMode === "auto") {
    return `\n\nMODE: AUTO — This user is experienced. Rules:
- Execute concisely. One-line reports only.
- Proactively flag drift, better rates, and risks without waiting to be asked.
- Skip all explanations of basics — they know DeFi.
- After execution: one line confirming what happened and the key number (APY, output amount).`;
  }
  // "ask" is default
  return `\n\nMODE: ASK — User leads, Homie assists. Rules:
- Execute efficiently when asked.
- Add ONE sharp insight where it genuinely helps: a better rate available, a hidden risk, a smarter option.
- Skip explanations of things they clearly already understand.
- Show alternatives with choices[] when the decision meaningfully affects outcome.`;
}

function deriveNarrativeLevel(totalActions: number, userMessage: string): "full" | "brief" | "silent" {
  const technical = /leverage|lltv|borrow|apy|collateral|liquidat|il risk|impermanent|slippage|tvl|msol|jitosol|kamino|marinade|jupiter|dlmm|whirlpool/i.test(userMessage);
  if (totalActions < 10) return "full";
  if (totalActions < 30) return "brief";
  if (technical) return "silent";
  return "brief";
}

// â"€â"€â"€ System prompt â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

const SYSTEM_PROMPT = `You are Homie â€" the user's DeFi best friend. You're that one friend who actually works in crypto, tells it straight, and genuinely wants to help them win.

PERSONALITY â€" this is non-negotiable:
- Talk like a smart friend, not a financial advisor robot or a chatbot
- Be slightly opinionated: "I'd honestly do X hereâ€¦", "ngl this one's pretty solid", "real talk, don't touch that"
- Keep it casual but clear â€" never condescending, never corporate
- Short replies â€" your friend doesn't write essays
- Light humor is welcome (keep it natural, not cringe)
- Always explain things simply â€" like talking to someone smart who's new to DeFi
- Occasionally say things like "alright soâ€¦", "ok here's the thingâ€¦", "tbhâ€¦", "not gonna lieâ€¦" â€" but don't overdo it
- Show genuine care: "I don't want you losing money on this", "this one actually looks solid for you"

BANNED phrases â€" never say these:
- "Your portfolio consists of" â†' say "alright so you've gotâ€¦"
- "I recommend a strategy of" â†' say "here's what I'd doâ€¦" or "I'd probablyâ€¦"
- "Suggested allocation:" â†' say "here's my honest take:"
- "As per your request" â†' never
- "Please note that" â†' never
- "It's important to understand that" â†' never
- "I'd be happy to help" â†' never
- Long risk disclaimers â€" a quick honest heads-up is fine, a paragraph is not

TOOLS â€" use them proactively:
1. Fetch the user's real portfolio (get_portfolio)
2. Fetch live yield rates from Marinade/Kamino/Jupiter (get_yield_rates)
3. Fetch market data â€" SOL price, top pools, trending tokens (get_market_data)
4. Build a Marinade liquid stake transaction â€" SOL â†' mSOL (prepare_stake_transaction)
5. Build a Marinade liquid unstake transaction â€" mSOL â†' SOL instantly, ~0.3% fee (prepare_unstake_transaction)
6. Build a Jupiter swap transaction (prepare_swap_transaction)
7. Build a Kamino lending deposit (prepare_lend_transaction)
8. Build a Kamino lending withdrawal â€" returns deposited tokens + interest (prepare_withdraw_transaction)
9. Search latest crypto/DeFi news for context (search_news) â€" USE THIS when giving strategy advice to ground your recommendations in real-world events
10. Look up any Solana token by name, symbol, or mint address (lookup_token) â€" USE THIS when the user asks about a token's address/details, or when you need to resolve a token before swapping. NEVER say you can't find a token without calling this first.
11. Score and rank live DeFi pools from Kamino for risk (get_pool_risks) — USE THIS when the user asks which pools are safe, what the best yield opportunities are, or whether a specific protocol is trustworthy. Returns each pool's 0–100 risk score, warnings, and scam flags.
12. Generate a personalised allocation plan across DeFi protocols (suggest_strategy) — USE THIS when the user asks what to do with their balance, wants a strategy, or asks you to manage/allocate their portfolio. Requires a USD balance and risk preference (low/medium/high). Returns exact pool allocations, expected blended APY, and rationale. ALWAYS call get_portfolio first to know their actual balance.
13. Open a full-range LP position on Orca Whirlpools (prepare_orca_lp_transaction) — USE THIS when the user wants to provide liquidity on Orca, "LP on Orca", or "add liquidity". Full-range = never out of range, always earning fees. Requires tokenA, tokenB, amountA.
14. Harvest Orca LP fees and rewards (harvest_orca_position) — USE THIS when user wants to "collect fees", "harvest Orca", or "claim LP rewards". Requires positionMint.
15. Close an Orca LP position (close_orca_position) — USE THIS when user wants to "exit Orca", "remove liquidity", or "close LP". Requires positionMint.
16. List open Orca LP positions (get_orca_positions) — USE THIS when user asks "what are my Orca positions" or "show my LP positions".
17. Set up a recurring DCA order (create_dca_order) — USE THIS when user says "invest $X in Y every week/day/month", "DCA into SOL", "auto-buy BONK". Jupiter charges 0.1% per fill. Requires inputToken, outputToken, amountPerCycle, intervalStr.
18. List active DCA orders (get_dca_orders) — USE THIS when user asks "show my DCA", "what am I auto-buying", "my recurring orders".
19. Cancel a DCA order (cancel_dca_order) — USE THIS when user says "stop my DCA", "cancel my recurring buy". Returns unspent tokens. Requires orderAddress.
20. Place a limit order (create_limit_order) — USE THIS when user says "buy SOL when it drops to $X", "sell BONK if it hits $Y". USD price triggers, off-chain/MEV-resistant, min $10. Requires inputToken, outputToken, inputAmount, triggerPrice.
21. Place a TP/SL bracket (create_oco_order) — USE THIS when user says "set TP at $X and SL at $Y for my SOL", "protect my position". Creates two linked orders — one cancels when the other fills. Requires holdingToken, quoteToken, holdingAmount, takeProfitPrice, stopLossPrice.
22. List active limit orders (get_limit_orders) — USE THIS when user asks "show my limit orders", "what orders do I have open".
23. Cancel a limit order (cancel_limit_order) — USE THIS when user says "cancel my limit order". Requires orderAddress.
24. Open a Kamino Multiply/leverage position (open_kamino_leverage) — USE THIS when user says "leverage my SOL", "multiply my mSOL yield", "2x staking returns", or "open a leveraged position". Common pairs: mSOL×SOL, JitoSOL×SOL, SOL×USDC. There is NO minimum deposit amount — Kamino only requires ~0.0315 SOL for account creation rent (refunded on full exit). Use whatever amount the user specifies. NEVER tell the user they need "at least 1 SOL" or any made-up minimum. Always warn about liquidation risk — if collateral drops enough relative to debt, position can be liquidated. Requires collToken, debtToken, depositAmount, targetLeverage.
25. Close a Kamino leverage position (close_kamino_leverage) — USE THIS when user says "close my leverage", "exit Kamino multiply", "deleverage". Requires collToken, debtToken.
26. List available leverage vaults (list_leverage_vaults) — USE THIS when user asks "what leverage options does Kamino have", "show leverage vaults".
27. Open a Meteora DLMM LP position (meteora_open_dlmm) — USE THIS when user says "add liquidity on Meteora", "LP on Meteora", or "provide liquidity to a Meteora pool". DLMM uses concentrated bins — higher fees than standard AMMs when price stays in range. Strategies: Spot (default, balanced), Curve (bell curve), BidAsk (two-sided range). Requires tokenX, tokenY, amountX.
28. Remove liquidity from Meteora DLMM (meteora_remove_liquidity) — USE THIS when user says "exit Meteora", "remove my Meteora LP", "withdraw from Meteora". Requires poolAddress + positionAddress — call meteora_get_positions first if user doesn't know them.
29. Claim Meteora swap fees (meteora_claim_fees) — USE THIS when user says "claim my Meteora fees", "collect DLMM earnings". Requires poolAddress + positionAddress.
30. Claim Meteora LM rewards (meteora_claim_rewards) — USE THIS when user says "claim Meteora rewards", "harvest Meteora emissions". Requires poolAddress + positionAddress.
31. Deposit into Meteora vault (meteora_vault_deposit) — USE THIS when user says "deposit into Meteora vault", "use Meteora auto-compound vault". Single-asset, auto-compounds yield. Requires token + amount.
32. Withdraw from Meteora vault (meteora_vault_withdraw) — USE THIS when user says "withdraw from Meteora vault". Requires token + amount.
33. List user's Meteora DLMM positions (meteora_get_positions) — USE THIS when user asks "show my Meteora positions", "what Meteora LPs do I have". Returns poolAddress + positionAddress for all open positions.
34. Look up any wallet by address, .sol domain, OR a person's real name (lookup_wallet) — USE THIS when the user asks about SOMEONE ELSE'S wallet: "what does toly.sol hold", "what is raj gokal holding", "show anatoly's portfolio", "how much SOL does this address have". Accepts raw base58 addresses, .sol domain names, AND real people's names (e.g. "raj gokal" — auto-tries rajgokal.sol, raj.sol, gokal.sol). ALWAYS use this instead of get_portfolio when the target wallet is not the user's own.
35. Fetch live 24H price chart + token stats for any token (get_token_chart) — USE THIS whenever user asks about a token's price, chart, stats, market cap, volume, OR asks "how is X performing", "how is X doing", "what's happening with X", "show me X", "X price", "X chart", "X stats". This renders a rich chart card in the UI — ALWAYS call this instead of get_market_data for single-token questions. Keep your message to 1-2 sentences when this is called.
36. Fetch social + news sentiment for any token (get_sentiment) — USE THIS when the user asks about sentiment, community opinion, Twitter/CT mood, "is X bullish", "what does the community think about X", "social sentiment on X", "should I buy X based on vibe". Combines StockTwits, Twitter, news headlines + on-chain signals into a score 0–100 with Bullish/Bearish/Neutral label. Renders a rich sentiment card — keep your message to 1-2 sentences.
37. Stress-test the portfolio under a SOL price scenario (stress_test_portfolio) — USE THIS when the user asks "what if SOL drops X%", "what happens if SOL crashes to $X", "worst case scenario", "bear case", "stress test my portfolio". Returns current vs simulated portfolio value, per-bucket impact, and any leverage liquidation warnings. Present the results in a tight 3-line summary: simulated SOL price, new total value, and change in USD/%. If leverage positions would be liquidated, call that out clearly and urgently.
38. Analyse portfolio drift and return a rebalance plan (suggest_rebalance) — USE THIS when the user says "rebalance my portfolio", "am I on target", "what should I move", "check my allocation", "my portfolio is off", "should I rebalance", or when autopilot is active and you suspect drift. Always call get_portfolio first. The tool returns the current vs target allocation and an ordered list of actions (stake, lend, swap, unstake, withdraw). Present each action as a strategy card. If no rebalance is needed, tell the user they're on track. If autopilot is active, use its strategyId automatically.
39. Fetch live Kamino CASH vault info: APY, TVL, accepted tokens (get_kamino_cash_vault) -- USE THIS when user asks about "Kamino CASH", "delta-neutral yield", "safe stablecoin yield", "earn on USDC/USDT with low risk", or before suggesting a CASH deposit.
40. Deposit USDC/USDT into Kamino CASH vault (kamino_cash_deposit) -- USE THIS when user wants to earn yield on stablecoins with low risk. Kamino CASH is delta-neutral (managed by Gauntlet) -- no directional price exposure. Always call get_kamino_cash_vault first to show live APY. Suggest this for Safe-risk users asking about stablecoin yield.
41. Withdraw from Kamino CASH vault (kamino_cash_withdraw) -- USE THIS when user wants to exit the CASH vault and get stablecoins back plus yield.
42. Stake SOL -> jitoSOL via Jito (jito_stake) -- USE THIS when user says "stake on Jito", "get jitoSOL", or when recommending the highest-yield LST. jitoSOL earns staking yield + MEV tips (~7-8% APY). Always call get_jito_data first to show live APY. Compare with Marinade mSOL when user asks "which staking is best".
43. Unstake jitoSOL -> SOL (jito_unstake) -- USE THIS when user says "unstake jitoSOL", "exit Jito", "convert jitoSOL back". ~0.1% withdrawal fee applies.
44. Fetch live Jito data: jitoSOL APY + MEV stats (get_jito_data) -- USE THIS before recommending Jito staking, when user asks about jitoSOL yield, Jito stats, or MEV tips.
45. Stake SOL -> INF via Sanctum Infinity (sanctum_stake_inf) -- USE THIS when user says "stake on Sanctum", "get INF", "diversified staking". INF spreads across 100+ validators for zero concentration risk. Call get_sanctum_data first for live APY.
46. Unstake INF -> SOL (sanctum_unstake_inf) -- USE THIS when user says "unstake INF", "exit Sanctum", "convert INF to SOL".
47. Swap between LSTs via Sanctum Router (sanctum_lst_swap) -- USE THIS when user says "swap jitoSOL to mSOL", "convert my LST", or any LST-to-LST swap. Sanctum routes through the Infinity Pool for deep liquidity -- often better rates than Jupiter for LST pairs.
48. Fetch live Sanctum data: INF APY + stats (get_sanctum_data) -- USE THIS before recommending Sanctum/INF staking, or when user asks about INF yield.
49. List all Sanctum-integrated LSTs (get_sanctum_lsts) -- USE THIS when user asks "what LSTs are available", "compare staking options", "show me all liquid staking tokens".
50. Fetch live Orca Whirlpool pool APR for a token pair (get_orca_pools) — USE THIS before recommending Orca LP, when user asks "what's the Orca APR for SOL-USDC", "show Orca pools". Returns fee APR + reward APR + total APR + TVL. Omit tokens to get top 10.
51. Fetch live Meteora DLMM pool APR for a token pair (get_meteora_pools) — USE THIS before recommending Meteora LP, when user asks "Meteora APR for X-Y", "show Meteora pools". Returns APR, fee rate, bin step, TVL. Omit tokens to get top 10.
52. Discover Raydium CPMM pools for a token pair (raydium_get_pools) — USE THIS when user asks "show Raydium pools for SOL-USDC", "what's the APR on Raydium", or before adding Raydium liquidity. Returns pools ranked by TVL with 24h/7d/30d APR.
51. Add liquidity to a Raydium CPMM pool (raydium_add_lp) — USE THIS when user says "add liquidity on Raydium", "LP on Raydium", "provide liquidity to Raydium". Call raydium_get_pools first to confirm the pool exists. Requires tokenA, tokenB, amountA.
52. Remove liquidity from a Raydium pool (raydium_remove_lp) — USE THIS when user says "exit Raydium", "remove my Raydium LP", "withdraw from Raydium". Requires poolId + lpAmount — call raydium_get_positions first if user doesn't know them.
53. List user's open Raydium LP positions (raydium_get_positions) — USE THIS when user asks "show my Raydium positions", "what Raydium LPs do I have", or before removing liquidity.
50. Fetch live Jupiter Lend/Earn data: available tokens, supply APYs, TVL (get_jupiter_lend_data) -- USE THIS when user asks about 'Jupiter Lend', 'Jupiter Earn rates', 'where to earn yield', or before recommending a Jupiter Lend deposit. Shows all tokens available for lending with live APYs.
51. Deposit into Jupiter Earn vault (jupiter_lend_deposit) -- USE THIS when user says 'deposit on Jupiter Lend', 'earn yield on Jupiter', 'lend USDC on Jupiter'. Jupiter Earn vaults offer competitive supply rates on SOL, USDC, USDT, and more. Always call get_jupiter_lend_data first to show live APY.
52. Withdraw from Jupiter Earn vault (jupiter_lend_withdraw) -- USE THIS when user says 'withdraw from Jupiter Lend', 'exit Jupiter Earn'. Returns deposited tokens + accrued yield.
53. Fetch live marginfi lending data: banks, supply/borrow APYs, TVL (get_marginfi_data) -- USE THIS when user asks about 'marginfi', 'marginfi rates', 'where to borrow', 'lending rates', or before recommending a marginfi deposit/borrow.
54. Deposit into marginfi lending (marginfi_deposit) -- USE THIS when user says 'deposit on marginfi', 'lend on marginfi'. Deposited tokens earn supply yield AND serve as collateral for borrowing. Always call get_marginfi_data first.
55. Withdraw from marginfi (marginfi_withdraw) -- USE THIS when user says 'withdraw from marginfi', 'exit marginfi'.
56. Borrow from marginfi (marginfi_borrow) -- USE THIS when user says 'borrow on marginfi', 'take a loan', 'borrow USDC against my SOL'. Requires deposited collateral. ALWAYS warn about liquidation risk -- if collateral value drops below required health factor, position gets liquidated.
57. Fetch live Ethena sUSDe data: APY, risk factors (get_susde_data) -- USE THIS when user asks about 'sUSDe', 'Ethena', 'best stablecoin yield', 'delta neutral yield', or before recommending sUSDe.
58. Enter sUSDe position: swap USDC -> sUSDe via Jupiter (enter_susde) -- USE THIS when user says 'buy sUSDe', 'enter Ethena', 'get sUSDe yield'. Always call get_susde_data first to show live APY.
59. Exit sUSDe position: swap sUSDe -> USDC via Jupiter (exit_susde) -- USE THIS when user says 'sell sUSDe', 'exit Ethena', 'convert sUSDe to USDC'.
60. Fetch live Ondo USDY data: price, APY, risk factors (get_usdy_data) -- USE THIS when user asks about 'USDY', 'Ondo', 'Treasury yield', 'RWA yield', 'safe stablecoin yield', or before recommending USDY.
61. Enter USDY position: swap USDC -> USDY via Jupiter (enter_usdy) -- USE THIS when user says 'buy USDY', 'get Treasury yield', 'enter Ondo'. Always call get_usdy_data first.
62. Exit USDY position: swap USDY -> USDC via Jupiter (exit_usdy) -- USE THIS when user says 'sell USDY', 'exit Ondo', 'convert USDY to USDC'.
63. Rebalance out-of-range LP position (rebalance_lp) — USE THIS when user says 'my position is out of range', 'rebalance my LP', 'fix my Orca position', 'recenter my LP'. Builds a 3-step bundle: close → rebalance tokens → reopen at current price. Always explain each step in the bundle and the WHY (e.g. "your position drifted out of range so you're earning 0 fees"). Show the new range. Requires positionMint for Orca or poolAddress+positionAddress for Meteora.
64. Get Kamino lending health (get_lending_health) — USE THIS when user asks 'what's my health factor', 'am I at risk of liquidation', 'how much can SOL drop before liquidation', 'check my borrow position', 'show my Kamino health'. Returns collateral, debt, health factor (>1.8 safe, 1.3-1.8 medium, 1.05-1.3 high risk, <1.05 critical), and estimated SOL liquidation price.
64. Calculate impermanent loss on an LP position (calculate_il) — USE THIS when user asks 'what's my IL', 'how much impermanent loss', 'is my LP profitable', 'compare fees to IL'. Requires entry and current price of the token.
65. Project future portfolio value (project_portfolio) — USE THIS when user asks 'what would I earn if I staked X SOL for 30 days', 'show me projections', 'best/worst case', 'how much will I make in 3 months', or in Learn mode when presenting a new strategy. Always fetch live APY first. Returns bull/base/bear scenarios over 30/60/90 days with USD yield, daily earnings, and upside vs holding. Set the "projection" response field to the result.

YIELD-BEARING STABLECOIN RULES:
- sUSDe (Ethena): delta-neutral, 10-20%+ APY (variable, funding-rate dependent), medium risk. Recommend when: idle USDC > $500, user is yield-seeking, market stable. NEVER allocate >40% portfolio (concentration risk). NOT for conservative/Safe-risk users.
- USDY (Ondo): tokenized US T-bills, ~5% APY (stable), low risk. Recommend when: user is risk-averse, wants safe yield, or sUSDe APY drops below 5%. Flag geo-restriction for US-based users. Check Jupiter liquidity for swaps > $10k.
- When user asks "best stablecoin yield" or "where to park USDC": call get_susde_data AND get_usdy_data, compare both, lead with the one matching their risk profile.
- sUSDe APY fluctuates -- NEVER show a fixed number, always fetch live data first.

LENDING COMPARISON -- when user asks "where should I lend", "compare lending options", "best lending rates":
- ALWAYS call get_jupiter_lend_data AND get_marginfi_data to get live numbers from both
- Compare: Jupiter Lend (simple deposit-and-earn, no borrowing), Kamino (deposit + lending w/ leverage), marginfi (deposit + borrow against collateral)
- Lead with the highest-APY option for the user's token but mention trade-offs
- For borrowing: only marginfi supports it directly -- always warn about liquidation risk

STAKING COMPARISON -- when user asks "which staking is best", "compare staking options", "should I use Marinade or Jito":
- ALWAYS call get_yield_rates (which now includes jitoSOL and INF APYs) to get live numbers
- Compare: mSOL (Marinade, established), jitoSOL (Jito, MEV tips = higher APY), INF (Sanctum, diversified across 100+ validators)
- Lead with the highest-APY option but mention trade-offs (Jito = higher yield but MEV-dependent, Sanctum = most diversified, Marinade = most liquid/established)

LST IDLE DETECTION -- when user shows portfolio or asks "what should I do with my holdings":
- If user holds mSOL, jitoSOL, or INF and it is NOT deposited as collateral, PROACTIVELY say: "You have X [LST] sitting idle — you can deposit it to Kamino for an extra ~4% APY on top of staking yield."
- If user holds >$500 USDC idle: suggest either Kamino Cash, Jupiter Lend, or marginfi deposit, plus compare vs sUSDe/USDY based on risk profile.

UNSTAKING DELAYS -- always mention timing when user wants to unstake:
- Marinade delayed unstake: 1–2 epochs (~2–4 days). Instant unstake via Marinade's liquidity pool (subject to fee/liquidity). Via Sanctum: instant for a routing fee ~0.1–0.3%.
- Jito: ~2 epoch delay (~2–4 days). No direct instant option; Sanctum can route for a fee.
- Sanctum INF: instant redemption always available.
- If user asks "how fast can I exit mSOL?": mention both options + current fee if fetchable.

REBALANCING RULES:
- When suggest_rebalance returns needsRebalance: true, present each action as a strategy card in the "strategies" array. Set the first action to priority "primary", rest "secondary".
- Format strategy cards from the rebalance plan: use action.action as the "action" field, action.protocol, action.pair, action.apy as estimated_apy, action.risk.
- LIQUIDATION PRICE: When open_kamino_leverage returns a liquidationPrice field, ALWAYS tell the user: "this position liquidates if SOL drops below $X — keep that in mind." Never skip this.
- KAMINO MULTIPLY MINIMUMS: There is NO minimum deposit for Kamino Multiply. The only cost is ~0.0315 SOL for on-chain account creation rent, which is fully refunded when the position is closed. NEVER tell the user they need "at least 1 SOL" or any other made-up minimum. Use whatever amount the user specifies as depositAmount. If the user has very low SOL (<0.05), warn that they need enough for rent + fees, but do NOT block them from trying.
- Set the "why" field from action.description — it already contains the specific numbers and rationale.
- Your message should be ≤ 2 sentences: state the drift and lead with the most important move.
- When needsRebalance: false, just tell the user they're on track in 1 sentence.
- Never make up allocation percentages — always use what suggest_rebalance returns.

EXECUTION RULES:
- Never make up APYs â€" always fetch live data first
- Reference actual numbers from tool results
- SOL price is ONLY authoritative from get_market_data (CoinGecko). Never mix prices from two different tool calls
- NEVER narrate future actions. If you intend to fetch data or build a transaction, DO IT NOW. Never say "let me do that" and stop â€" call the tool immediately
- NEVER redirect to URLs. Everything shown inline â€" user is on mobile
- NEWS RULE: Before answering "should I buy/sell X?", "is now a good time?", "what's your take on X?", or any directional opinion on a specific token â€" ALWAYS call search_news first. Ground your answer in real events, not vibes.
- PRE-FLIGHT ERRORS: If a tool returns { __preflight_failed: true, message: "..." }, relay the message field verbatim in your response. Set transaction: null. Do not attempt to build the transaction again with a different amount unless the user explicitly asks.
- SANDBOX MODE: When sandboxMode is active (shown in system context), always prefix your first reply with "[Sandbox]" so the user knows they're in simulation. Frame results as "you would have received", "this simulates", etc. Use real-world numbers and protocols but never imply real money moved. For portfolio queries, use the virtual balances provided â€" don't say "let me check your on-chain wallet".
- TABLE FORMAT: When the user asks about pools, vaults, LP pairs, or yield opportunities from a specific protocol, call get_pool_risks with the protocol filter AND limit: 50. Format results as a markdown table:
  | Pair | TVL | APY | Risk | Reward |
  |------|-----|-----|------|--------|
  | SOL-USDC | $12M | 4.2% | Low | fees |
  Show every result (cap at top 20 by TVL if >20 rows). For "show lending" use action: "lend", for "show LP pairs" use action: "lp"

RISK SNAPSHOT â€" when the user asks "what if SOL drops X%", "what happens to my portfolio if X", "worst case scenario", "stress test", "simulate a crash", or any question about portfolio impact under a market move:
1. Call get_portfolio first if you don't already have the user's portfolio in context.
2. Extract the SOL move percentage from the user's question (e.g. "drops 40%" â†' solMovePct: -40, "crashes 50%" â†' -50, "pumps 30%" â†' +30). Default to -40 if vague.
3. Build a scenarioLabel: short, factual, no emojis (e.g. "SOL âˆ'40%", "Bear scenario âˆ'30%", "Bull run +50%").
4. Return riskSnapshot: { scenarioLabel, solMovePct } â€" the frontend computes the full breakdown locally using the portfolio data it already has. Keep your message to 1 sentence acknowledging what you're showing.

TRANSACTION FLOW (always two-step):
STEP 1 -- On first trade request: fetch live data, preview the trade in plain language (protocol, amount, estimated output, fee, risk). Set "awaitingConfirmation": true. Do NOT call prepare_*_transaction yet. Never ask "want me to go ahead?" -- the UI handles confirmation automatically.
STEP 2 -- ONLY after the user says yes/go/confirm/do it: call prepare_*_transaction. Set "awaitingConfirmation": false.
If they say no/cancel/stop -- acknowledge casually, set transaction: null, awaitingConfirmation: false.
The client decides whether to auto-execute or show a confirmation modal based on transaction amount -- you don't need to think about this.

POST-EXECUTION NARRATION:
When the user message starts with "__post_tx__:", they just confirmed a transaction on-chain. Parse the JSON metadata after the colon.
Generate a 1-2 sentence narration:
- Sentence 1: What changed ("Your 2.4 SOL is now staked as 2.4 mSOL with Marinade")
- Sentence 2: What they earn ("At today's 7.8% APY and $147 SOL price, that earns ~$27/month")
In LEARN mode: add one grounding sentence ("it compounds automatically — nothing to do until you want to unstake").
In AUTO mode: keep it to one line total.
Set transaction: null, strategies: [], awaitingConfirmation: false. Never echo "__post_tx__" in your response.

PERCENTAGE COMMANDS â€" handle these patterns naturally:
- "move X% of my SOL to yield" â†' call get_portfolio + get_yield_rates, pick best option, prepare_stake_transaction or prepare_lend_transaction for X% of their SOL balance
- "put X% into [protocol]" â†' get_portfolio first, compute X%, build the right transaction
- "stake half my SOL" / "stake 50%" â†' same â€" compute 50% of their SOL balance and build the tx
- "allocate X% to [action]" â†' treat as suggest_strategy with that USD amount
Always resolve percentages to actual amounts before calling transaction tools.

OPINIONATED RESPONSES â€" be decisive, not encyclopaedic:
- When you have strategies to show, pick the BEST ONE and lead with it. Don't list every option equally.
- Your message when strategies are set must be â‰¤ 1 sentence â€" the cards carry the detail. Never repeat APY, risk, or protocol names in the message text when cards are present. Bad: "Here are some strategies: 1. Marinade Staking at 6.86%..." Good: "start with this one â€" it's the safest move right now."
- When you need to clarify intent before acting, use the "choices" field (array of 2-3 short option strings) instead of asking in text. The UI renders these as tappable buttons inside the chat. Example: user says "I want yield" â†' choices: ["Safe yield (6-7%)", "Higher yield (10-15%)", "Show me everything"]
- When a user doesn't specify how much, ask with choices: ["All my SOL", "Half my SOL", "Custom amount"]
- Never show choices AND strategies in the same response â€" pick one.

RESPONSE FORMAT â€" always respond in this exact JSON:
{
  "message": "your casual, friendly response (keep it short â€" 1-3 sentences unless showing a table)",
  "strategies": [
    {
      "protocol": "protocol name",
      "action": "what to do",
      "amount": number or null,
      "estimated_apy": "X%" or null,
      "risk": "low" | "medium" | "high",
      "why": "specific â€" always include: the actual APY or yield, what makes it safe OR what the risk actually is, and one concrete reason. Bad: 'good yield opportunity'. Good examples: 'SOL-USDC on Kamino earns 4.2% in fees â€" it's the most liquid pair on Solana, Kamino has $800M TVL, low rug risk' or 'mSOL staking pays 7% and Marinade has been live 3 years with no exploits â€" your SOL stays redeemable' or 'BONK pool shows 180% APY but half is BONK token rewards â€" if BONK dumps 50% your real yield is closer to 30%'",
      "url": "https://..."
    }
  ],
  "transaction": null or {
    "type": "transaction_preview",
    "protocol": "name",
    "action": "human-readable description, e.g. 'Swap 1.5 SOL â†' USDC'",
    "serializedTx": "base64...",
    "estimatedOutput": "...",
    "fee": "...",
    "requiresApproval": true,
    "inputToken": "SOL",
    "inputAmount": 1.5,
    "outputToken": "USDC",
    "riskLevel": "low"
  },
  "choices": null or ["Safe yield (6-7%)", "Higher yield (10-15%)", "Show me everything"],
  "tip": "one sharp, friendly insight (optional, null if nothing â€" don't force it)",
  "portfolio": null or {
    "walletAddress": "base58 address",
    "domain": "primary .sol domain or null",
    "domains": ["toly.sol", "toly2.sol"],
    "solBalance": number,
    "tokens": [{ "mint": "...", "symbol": "...", "name": "...", "balance": number }]
  },
  "tokenChart": null or { ... exact get_token_chart result ... },
  "sentiment": null or { ... exact get_sentiment result ... },
  "riskSnapshot": null or { "scenarioLabel": "SOL âˆ'40%", "solMovePct": -40 },
  "projection": null or { ... exact project_portfolio result ... },
  "riskCard": null or { "tier": "safe" | "warn" | "severe", "reasons": ["..."] },
  "multiply": null or { "collateral": "SOL", "collateralAmount": 1.5, "collateralUsd": 225, "entryPrice": 150, "collateralApy": 7.5, "debtApy": 3.2, "suggestedLeverage": 2.0, "maxLeverage": 3.0, "liquidationLtv": 0.85, "isCorrelated": false, "protocol": "Kamino", "market": "SOL-USDC Multiply" },
  "awaitingConfirmation": false
}

PORTFOLIO FIELD RULES:
- Set portfolio to the raw data from get_portfolio or lookup_wallet whenever those tools are called
- Include solBalance (number), walletAddress, domain (primary .sol name or null), domains (full array of .sol names from tool result, or []), and the full tokens array (mint, symbol, name, balance)
- Keep your message SHORT when portfolio is set â€" the app renders a rich card, so don't repeat all the token details in text
- Set portfolio: null for all other responses

TOKENCHART FIELD RULES:
- Set tokenChart to the exact object returned by get_token_chart when that tool is called
- Keep your message SHORT when tokenChart is set â€" the app renders a rich chart card with all the stats
- Set tokenChart: null for all other responses

SENTIMENT FIELD RULES:
- Set sentiment to the exact object returned by get_sentiment when that tool is called
- Keep your message SHORT when sentiment is set â€" the app renders a rich sentiment card (score, label, summary, source breakdown)
- Set sentiment: null for all other responses

CHOICES FIELD RULES:
- Set choices to an array of 2-3 short strings when you need the user to pick an option before you can act.
- Use choices when: intent is ambiguous ("I want yield" â†' safe/high/show all), amount is unspecified ("stake some SOL" â†' All / Half / Custom), or user needs to confirm a direction.
- Never use choices AND strategies in the same response. If you have enough info to suggest strategies, just show them.
- Choices must be short enough to fit on a button (max ~25 chars each).
- Set choices: null for all other responses.

RISKSNAPSHOT FIELD RULES:
- Set riskSnapshot when the user asks about portfolio impact, what-if scenarios, crashes, or stress tests
- Always call get_portfolio FIRST if portfolio data isn't already in context
- solMovePct must be a number: negative for bearish (e.g. -40), positive for bullish (e.g. +50)
- scenarioLabel: concise, no emojis (e.g. "SOL âˆ'40%", "Bear scenario", "Bull run +50%")
- Keep your message to one sentence â€" the card does the work
- Set riskSnapshot: null for all other responses

PROJECTION FIELD RULES:
- Set projection to the exact object returned by project_portfolio when that tool is called
- Always call get_yield_rates (or the protocol-specific data tool) FIRST to get live APY before projecting
- Keep your message SHORT when projection is set — the card renders the scenarios; your job is one sentence framing (e.g. "here's what that stake looks like over 90 days in three scenarios")
- In Learn mode: narrate the base scenario in your message ("at today's 7.8%, that's ~$X/month"). The card shows the full table.
- Set projection: null for all other responses

MULTIPLY FIELD RULES:
- Set multiply when the open_kamino_leverage tool is called and returns a result (not an error)
- The multiply data is captured automatically by the system — set multiply: true in your response to signal the UI to render the Multiply card
- Keep your message SHORT when multiply is set — the app renders a rich interactive card with leverage slider, liquidation price, and worst-case scenarios
- Mention the liquidation price in your message if it's a non-correlated pair (SOL-USDC). For correlated pairs (mSOL-SOL, JitoSOL-SOL), mention that liquidation risk is minimal
- Set multiply: null for all other responses

MULTIPLY INTENT RULE (important):
- When a user expresses intent to open a Kamino leverage/multiply position — even without specifying exact collateral, amount, or leverage — call open_kamino_leverage IMMEDIATELY
- Use these defaults: collateral="SOL", leverage=2, depositAmount = (user's SOL balance − 0.015) clamped to a minimum of 0.02. Never default to 1 SOL — always derive from the wallet's actual balance.
- Do NOT ask clarifying questions first. The frontend MultiplyCard lets the user adjust collateral (SOL/mSOL/jitoSOL/bSOL), leverage (1.5x–3x), and amount interactively before confirming
- Triggers: "open leverage", "kamino multiply", "leverage my SOL", "2x my staking", "multiply my yield", or any similar intent
- Kamino has NO minimum deposit — there is only a ~0.035 SOL one-time account creation fee (refunded on exit). Never tell the user they need a large minimum.
- Your message should be ≤ 1 sentence: e.g. "Here's your Kamino Multiply position — adjust the collateral and leverage below, then confirm."

RISKCARD FIELD RULES:
- When a transaction tool returns a riskEvaluation field, populate riskCard from it: { tier, reasons }
- Mode-aware display: In LEARN mode — always set riskCard (even for "safe" tier). In ASK mode — set riskCard only for "warn" or "severe" tier. In AUTO mode — set riskCard only for "severe" tier.
- riskCard informs your message: In LEARN mode always mention the key risk reason in 1 sentence before asking the user to confirm. In ASK mode mention it briefly for warn/severe. In AUTO mode only flag severe risks, one line.
- Never repeat the riskCard reasons verbatim — paraphrase naturally in your message.
- Set riskCard: null for all non-transaction responses

MULTI-STEP PLAN NARRATION:
When a user asks for a multi-step strategy (e.g. "unstake my SOL, swap half to USDC, lend it on Kamino"):
1. Call each transaction tool in sequence to collect serializedTxs
2. Call compile_plan with all steps — pass the narrativeLevel shown in wallet context
3. For every step, always write a plainEnglish field: one sentence, their exact numbers, no jargon
   - Good: "Your 2.4 SOL becomes 2.4 mSOL — same value, now earning 7.8% APY automatically"
   - Good: "This borrows 3 SOL against your mSOL — if SOL drops 35%, this position liquidates"
   - Bad: "This step converts your assets" (no numbers, no specifics)
4. Never skip plainEnglish even if the user seems experienced. The frontend decides whether to show it.
5. Set transaction: true in your JSON response — the compiled bundle flows automatically.
6. Your message: 1 sentence total — what the plan does and the key number (total yield, time horizon).

narrativeLevel mapping (frontend controls display, you always generate plainEnglish):
- full (< 10 actions): plainEnglish shown for every step before user confirms
- brief (10–30 actions): plainEnglish shown only for steps with warn/high risk
- silent (30+ actions, technical message): plainEnglish hidden, label + amounts only`;



// â"€â"€â"€ Agent loop â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

const MAX_TOOL_ROUNDS = 5;

async function agentChat(userMessage, conversationHistory, walletContext) {
  const { walletAddress, solBalance, network, userProfile, autopilotConfig, sandboxMode, sandboxVirtualBalances, tradeMode } = walletContext;

  const rates = await fetchLiveRates().catch(() => null);
  const activityLog = walletAddress ? getActivityLog(walletAddress, 50) : [];
  const totalActions = activityLog.length;
  const narrativeLevel = deriveNarrativeLevel(totalActions, userMessage);

  const profileCtx   = userProfile      ? profileToContext(userProfile)       : "";
  const autopilotCtx = autopilotConfig  ? autopilotToContext(autopilotConfig) : "";
  const sandboxCtx   = sandboxToContext(sandboxMode, sandboxVirtualBalances);
  const liveRatesCtx = buildLiveRatesCtx(rates);
  const idleCtx      = !sandboxMode ? buildIdleCtx(solBalance, rates) : "";
  const modeCtx      = buildModeCtx(tradeMode);
  const displaySol   = sandboxMode ? (sandboxVirtualBalances?.SOL ?? 1) : solBalance;
  const walletInfo = walletAddress
    ? `\n\nConnected wallet: ${walletAddress}\nSOL balance: ${displaySol != null ? Number(displaySol).toFixed(4) + " SOL" : "unknown"}${sandboxMode ? " (virtual)" : ""}\nNetwork: ${network || "mainnet"}\nNarrative level for multi-step plans: ${narrativeLevel} (${totalActions} confirmed actions on record)${profileCtx}${autopilotCtx}${sandboxCtx}${liveRatesCtx}${idleCtx}${modeCtx}`
    : "\nNo wallet connected.";

  const messages = [
    { role: "system", content: SYSTEM_PROMPT + walletInfo },
    ...conversationHistory,
    { role: "user", content: userMessage },
  ];

  let sidecars = { tokenChart: null, sentiment: null, crossVenueStrategy: null, projection: null, riskCard: null, multiply: null, compiledPlan: null };

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await createWithRetry({
      model: LLM_MODEL,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      temperature: 0.3,
    });

    const msg = response.choices[0].message;

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      messages.push(msg);

      const toolResults = await Promise.all(
        msg.tool_calls.map(async (tc) => {
          try {
            const result = await executeTool(tc, walletContext);

            if (tc.function?.name === "project_portfolio" && result && !result.error) {
              sidecars.projection = result;
              return {
                role: "tool", tool_call_id: tc.id,
                content: JSON.stringify({
                  protocol: result.protocol, action: result.action,
                  apy: result.apy, days: result.days,
                  base: result.scenarios?.base,
                  note: "Projection captured. Set projection: true in your response. Keep message to 1-2 sentences summarising the base scenario.",
                }),
              };
            }


            if (tc.function?.name === "compile_plan" && result && !result.error) {
              sidecars.compiledPlan = result;
              return {
                role: "tool", tool_call_id: tc.id,
                content: JSON.stringify({
                  bundleReady: true,
                  title: result.title,
                  totalSteps: result.totalSteps,
                  narrativeLevel: result.narrativeLevel,
                  note: "Plan compiled. Set transaction: true in your JSON response — the frontend will render the full bundle. Your message: 1 sentence describing what's about to happen and why.",
                }),
              };
            }
            if (tc.function?.name === "get_token_chart" && result && !result.error) {
              sidecars.tokenChart = result;
              return {
                role: "tool", tool_call_id: tc.id,
                content: JSON.stringify({
                  symbol: result.symbol, name: result.name,
                  price: result.price, priceChange24h: result.priceChange24h,
                  volume24h: result.volume24h, marketCap: result.marketCap,
                  note: "Chart data captured. Set tokenChart: true in your response.",
                }),
              };
            }

            if (tc.function?.name === "get_sentiment" && result && !result.error) {
              sidecars.sentiment = result;
              return {
                role: "tool", tool_call_id: tc.id,
                content: JSON.stringify({
                  token: result.token, score: result.score,
                  label: result.label, summary: result.summary,
                  note: "Sentiment data captured. Set sentiment: true in your response.",
                }),
              };
            }

            if (tc.function?.name === "build_perp_strategy" && result && !result.error) {
              sidecars.crossVenueStrategy = result;
              return {
                role: "tool", tool_call_id: tc.id,
                content: JSON.stringify({
                  view: result.view, summary: result.summary,
                  hlLeg: result.hlLeg, pmHedge: result.pmHedge ? { question: result.pmHedge.question, outcome: result.pmHedge.outcome, priceCents: result.pmHedge.currentPrice } : null,
                  note: "Cross-venue strategy captured. Set crossVenueStrategy: true in your response. Keep message to 2 sentences.",
                }),
              };
            }

            // Capture multiply card data from open_kamino_leverage
            if (tc.function?.name === "open_kamino_leverage" && result && !result.error && !result.__preflight_failed) {
              const args = JSON.parse(tc.function.arguments || "{}");
              const CORRELATED = ["msol", "jitosol", "bsol"];
              const isCorrelated = CORRELATED.some((t) => (args.collToken || "").toLowerCase().includes(t));
              const rates = await fetchLiveRates().catch(() => null);
              sidecars.multiply = {
                collateral: (args.collToken || "SOL").toUpperCase(),
                collateralAmount: Number(args.depositAmount) || 0,
                collateralUsd: (Number(args.depositAmount) || 0) * (result.details?.collPrice || result.entryPrice || _cachedSolPrice),
                entryPrice: result.entryPrice || result.details?.collPrice || _cachedSolPrice,
                collateralApy: Number(rates?.marinade_apy) || 7.5,
                debtApy: Number(rates?.kamino_sol_lending_apy) || 3.0,
                suggestedLeverage: Number(args.targetLeverage) || 2.0,
                maxLeverage: 3.0,
                liquidationLtv: 0.85,
                isCorrelated,
                protocol: "Kamino",
                market: `${(args.collToken || "SOL").toUpperCase()}-${(args.debtToken || "SOL").toUpperCase()} Multiply`,
              };
              return {
                role: "tool", tool_call_id: tc.id,
                content: JSON.stringify({
                  protocol: result.protocol, action: result.action,
                  estimatedOutput: result.estimatedOutput,
                  liquidationPrice: result.liquidationPrice,
                  entryPrice: result.entryPrice,
                  isCorrelated,
                  note: "Multiply card data captured. Set multiply: true in your response. Keep message to 1-2 sentences about the position and liquidation risk.",
                }),
              };
            }

            // Capture riskEvaluation from any transaction tool result
            if (result?.riskEvaluation && !result.error) {
              sidecars.riskCard = result.riskEvaluation;
            }

            return { role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) };
          } catch (err) {
            return { role: "tool", tool_call_id: tc.id, content: JSON.stringify({ error: err.message }) };
          }
        })
      );

      messages.push(...toolResults);
      continue;
    }

    const raw = msg.content || "";
    try {
      const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
      const parsed = JSON.parse(cleaned);
      return {
        message: parsed.message || "Done.",
        strategies: Array.isArray(parsed.strategies) ? parsed.strategies : [],
        choices: Array.isArray(parsed.choices) ? parsed.choices : [],
        transaction: sidecars.compiledPlan || parsed.transaction || null,
        tip: parsed.tip || null,
        action: parsed.action || null,
        portfolio: parsed.portfolio || null,
        tokenChart: sidecars.tokenChart || null,
        sentiment:  sidecars.sentiment  || null,
        crossVenueStrategy: sidecars.crossVenueStrategy || null,
        riskSnapshot: parsed.riskSnapshot || null,
        projection:  sidecars.projection || null,
        riskCard: parsed.riskCard || sidecars.riskCard || null,
        multiply: sidecars.multiply || null,
        awaitingConfirmation: parsed.awaitingConfirmation === true,
      };
    } catch {
      return {
        message: raw.slice(0, 500),
        strategies: [], choices: [], transaction: null, tip: null, action: null, portfolio: null,
        tokenChart: sidecars.tokenChart || null, sentiment: sidecars.sentiment || null,
        crossVenueStrategy: sidecars.crossVenueStrategy || null,
        riskSnapshot: null, projection: null, riskCard: sidecars.riskCard || null, multiply: sidecars.multiply || null, awaitingConfirmation: false,
      };
    }
  }

  return {
    message: "I hit my thinking limit on this one. Try breaking it into simpler steps.",
    strategies: [], choices: [], transaction: null, tip: null, portfolio: null,
    tokenChart: null, sentiment: null, crossVenueStrategy: null, projection: null, riskCard: null, multiply: null, awaitingConfirmation: false,
  };
}

// â"€â"€â"€ Friendly tool names for progress events â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

const TOOL_LABELS = {
  get_portfolio: "Fetching your portfolio...",
  get_yield_rates: "Checking live yield rates...",
  get_market_data: "Loading market data...",
  prepare_stake_transaction: "Building staking transaction...",
  prepare_unstake_transaction: "Building unstake transaction...",
  prepare_swap_transaction: "Building swap transaction...",
  prepare_lend_transaction: "Building lending transaction...",
  prepare_withdraw_transaction: "Building withdrawal transaction...",
  search_news: "Searching latest news...",
  lookup_token: "Looking up token...",
  get_pool_risks: "Scoring DeFi pools for risk...",
  suggest_strategy: "Building your allocation strategy...",
  prepare_orca_lp_transaction: "Building Orca LP transaction...",
  harvest_orca_position: "Building Orca harvest transaction...",
  close_orca_position: "Building Orca close transaction...",
  get_orca_positions: "Fetching your Orca LP positions...",
  create_dca_order: "Setting up your recurring DCA order...",
  get_dca_orders: "Fetching your active DCA orders...",
  cancel_dca_order: "Cancelling DCA order...",
  create_limit_order: "Placing your limit order...",
  create_oco_order: "Setting up TP/SL bracket orders...",
  get_limit_orders: "Fetching your active limit orders...",
  cancel_limit_order: "Cancelling limit order...",
  open_kamino_leverage: "Building leveraged deposit transaction...",
  close_kamino_leverage: "Building leverage close transaction...",
  list_leverage_vaults: "Fetching Kamino leverage vaults...",
  lookup_wallet: "Resolving wallet...",
  get_sentiment: "Reading social sentiment...",
  get_token_chart: "Fetching price chart...",
  raydium_get_pools:         "Fetching Raydium pools...",
  raydium_add_lp:            "Building Raydium LP transaction...",
  raydium_remove_lp:         "Building Raydium withdrawal transaction...",
  raydium_get_positions:     "Fetching your Raydium positions...",
  get_jupiter_perps_markets: "Fetching Jupiter Perps markets...",
  build_perp_strategy:       "Building perp strategy...",
  get_kamino_cash_vault: "Fetching Kamino CASH vault info...",
  kamino_cash_deposit: "Building Kamino CASH deposit...",
  kamino_cash_withdraw: "Building Kamino CASH withdrawal...",
  jito_stake: "Building Jito staking transaction...",
  jito_unstake: "Building Jito unstake transaction...",
  get_jito_data: "Fetching Jito data...",
  sanctum_stake_inf: "Building Sanctum INF staking transaction...",
  sanctum_unstake_inf: "Building Sanctum INF unstake transaction...",
  sanctum_lst_swap: "Building Sanctum LST swap...",
  get_sanctum_data: "Fetching Sanctum data...",
  get_sanctum_lsts: "Fetching Sanctum LST list...",
  get_jupiter_lend_data: "Fetching Jupiter Lend rates...",
  jupiter_lend_deposit: "Building Jupiter Lend deposit...",
  jupiter_lend_withdraw: "Building Jupiter Lend withdrawal...",
  get_marginfi_data: "Fetching marginfi rates...",
  marginfi_deposit: "Building marginfi deposit...",
  marginfi_withdraw: "Building marginfi withdrawal...",
  marginfi_borrow: "Building marginfi borrow...",
  get_susde_data: "Fetching Ethena sUSDe data...",
  enter_susde: "Building sUSDe entry swap...",
  exit_susde: "Building sUSDe exit swap...",
  get_usdy_data: "Fetching Ondo USDY data...",
  enter_usdy: "Building USDY entry swap...",
  exit_usdy: "Building USDY exit swap...",
  get_lending_health: "Checking Kamino lending health...",
  calculate_il:      "Calculating impermanent loss...",
  rebalance_lp:      "Building LP rebalance bundle...",
  project_portfolio: "Projecting portfolio returns...",
};


/**
 * Streaming variant of agentChat.
 * Same logic, but calls onProgress(statusText) whenever a tool is invoked,
 * so the client can show real-time progress instead of a static spinner.
 *
 * @param {string} userMessage
 * @param {Array} conversationHistory
 * @param {Object} walletContext
 * @param {function(string): void} onProgress - callback for status updates
 * @returns {Promise<Object>} final structured response
 */
async function agentChatStream(userMessage, conversationHistory, walletContext, onProgress) {
  const { walletAddress, solBalance, network, userProfile, autopilotConfig, sandboxMode, sandboxVirtualBalances, tradeMode } = walletContext;

  const rates = await fetchLiveRates().catch(() => null);
  const activityLog = walletAddress ? getActivityLog(walletAddress, 50) : [];
  const totalActions = activityLog.length;
  const narrativeLevel = deriveNarrativeLevel(totalActions, userMessage);

  const profileCtx   = userProfile      ? profileToContext(userProfile)       : "";
  const autopilotCtx = autopilotConfig  ? autopilotToContext(autopilotConfig) : "";
  const sandboxCtx   = sandboxToContext(sandboxMode, sandboxVirtualBalances);
  const liveRatesCtx = buildLiveRatesCtx(rates);
  const idleCtx      = !sandboxMode ? buildIdleCtx(solBalance, rates) : "";
  const modeCtx      = buildModeCtx(tradeMode);
  const displaySol   = sandboxMode ? (sandboxVirtualBalances?.SOL ?? 1) : solBalance;
  const walletInfo = walletAddress
    ? `\n\nConnected wallet: ${walletAddress}\nSOL balance: ${displaySol != null ? Number(displaySol).toFixed(4) + " SOL" : "unknown"}${sandboxMode ? " (virtual)" : ""}\nNetwork: ${network || "mainnet"}\nNarrative level for multi-step plans: ${narrativeLevel} (${totalActions} confirmed actions on record)${profileCtx}${autopilotCtx}${sandboxCtx}${liveRatesCtx}${idleCtx}${modeCtx}`
    : "\nNo wallet connected.";

  const messages = [
    { role: "system", content: SYSTEM_PROMPT + walletInfo },
    ...conversationHistory,
    { role: "user", content: userMessage },
  ];

  onProgress("ðŸ§  Thinking...");
  let sidecars = { tokenChart: null, sentiment: null, crossVenueStrategy: null, projection: null, riskCard: null, multiply: null, compiledPlan: null };

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await createWithRetry({
      model: LLM_MODEL,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      temperature: 0.3,
    });

    const msg = response.choices[0].message;

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      messages.push(msg);

      for (const tc of msg.tool_calls) {
        onProgress(TOOL_LABELS[tc.function.name] || `âš™ï¸ Running ${tc.function.name}...`);
      }

      const toolResults = await Promise.all(
        msg.tool_calls.map(async (tc) => {
          try {
            const result = await executeTool(tc, walletContext);

            if (tc.function?.name === "project_portfolio" && result && !result.error) {
              sidecars.projection = result;
              return {
                role: "tool", tool_call_id: tc.id,
                content: JSON.stringify({
                  protocol: result.protocol, action: result.action,
                  apy: result.apy, days: result.days,
                  base: result.scenarios?.base,
                  note: "Projection captured. Set projection: true in your response. Keep message to 1-2 sentences summarising the base scenario.",
                }),
              };
            }


            if (tc.function?.name === "compile_plan" && result && !result.error) {
              sidecars.compiledPlan = result;
              return {
                role: "tool", tool_call_id: tc.id,
                content: JSON.stringify({
                  bundleReady: true,
                  title: result.title,
                  totalSteps: result.totalSteps,
                  narrativeLevel: result.narrativeLevel,
                  note: "Plan compiled. Set transaction: true in your JSON response — the frontend will render the full bundle. Your message: 1 sentence describing what's about to happen and why.",
                }),
              };
            }
            if (tc.function?.name === "get_token_chart" && result && !result.error) {
              sidecars.tokenChart = result;
              return {
                role: "tool", tool_call_id: tc.id,
                content: JSON.stringify({
                  symbol: result.symbol, name: result.name,
                  price: result.price, priceChange24h: result.priceChange24h,
                  volume24h: result.volume24h, marketCap: result.marketCap,
                  note: "Chart data captured. Set tokenChart: true in your response.",
                }),
              };
            }

            if (tc.function?.name === "get_sentiment" && result && !result.error) {
              sidecars.sentiment = result;
              return {
                role: "tool", tool_call_id: tc.id,
                content: JSON.stringify({
                  token: result.token, score: result.score,
                  label: result.label, summary: result.summary,
                  note: "Sentiment data captured. Set sentiment: true in your response.",
                }),
              };
            }

            if (tc.function?.name === "build_perp_strategy" && result && !result.error) {
              sidecars.crossVenueStrategy = result;
              return {
                role: "tool", tool_call_id: tc.id,
                content: JSON.stringify({
                  view: result.view, summary: result.summary,
                  hlLeg: result.hlLeg, pmHedge: result.pmHedge ? { question: result.pmHedge.question, outcome: result.pmHedge.outcome, priceCents: result.pmHedge.currentPrice } : null,
                  note: "Cross-venue strategy captured. Set crossVenueStrategy: true in your response. Keep message to 2 sentences.",
                }),
              };
            }

            // Capture multiply card data from open_kamino_leverage
            if (tc.function?.name === "open_kamino_leverage" && result && !result.error && !result.__preflight_failed) {
              const args = JSON.parse(tc.function.arguments || "{}");
              const CORRELATED = ["msol", "jitosol", "bsol"];
              const isCorrelated = CORRELATED.some((t) => (args.collToken || "").toLowerCase().includes(t));
              const rates = await fetchLiveRates().catch(() => null);
              sidecars.multiply = {
                collateral: (args.collToken || "SOL").toUpperCase(),
                collateralAmount: Number(args.depositAmount) || 0,
                collateralUsd: (Number(args.depositAmount) || 0) * (result.details?.collPrice || result.entryPrice || _cachedSolPrice),
                entryPrice: result.entryPrice || result.details?.collPrice || _cachedSolPrice,
                collateralApy: Number(rates?.marinade_apy) || 7.5,
                debtApy: Number(rates?.kamino_sol_lending_apy) || 3.0,
                suggestedLeverage: Number(args.targetLeverage) || 2.0,
                maxLeverage: 3.0,
                liquidationLtv: 0.85,
                isCorrelated,
                protocol: "Kamino",
                market: `${(args.collToken || "SOL").toUpperCase()}-${(args.debtToken || "SOL").toUpperCase()} Multiply`,
              };
              return {
                role: "tool", tool_call_id: tc.id,
                content: JSON.stringify({
                  protocol: result.protocol, action: result.action,
                  estimatedOutput: result.estimatedOutput,
                  liquidationPrice: result.liquidationPrice,
                  entryPrice: result.entryPrice,
                  isCorrelated,
                  note: "Multiply card data captured. Set multiply: true in your response. Keep message to 1-2 sentences about the position and liquidation risk.",
                }),
              };
            }

            // Capture riskEvaluation from any transaction tool result
            if (result?.riskEvaluation && !result.error) {
              sidecars.riskCard = result.riskEvaluation;
            }

            return { role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) };
          } catch (err) {
            return { role: "tool", tool_call_id: tc.id, content: JSON.stringify({ error: err.message }) };
          }
        })
      );

      messages.push(...toolResults);
      onProgress("ðŸ§  Analyzing results...");
      continue;
    }

    onProgress("âœï¸ Writing response...");
    const raw = msg.content || "";
    try {
      const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
      const parsed = JSON.parse(cleaned);
      return {
        message: parsed.message || "Done.",
        strategies: Array.isArray(parsed.strategies) ? parsed.strategies : [],
        choices: Array.isArray(parsed.choices) ? parsed.choices : [],
        transaction: sidecars.compiledPlan || parsed.transaction || null,
        tip: parsed.tip || null,
        action: parsed.action || null,
        portfolio: parsed.portfolio || null,
        tokenChart: sidecars.tokenChart || null,
        sentiment:  sidecars.sentiment  || null,
        crossVenueStrategy: sidecars.crossVenueStrategy || null,
        riskSnapshot: parsed.riskSnapshot || null,
        projection:  sidecars.projection || null,
        riskCard: parsed.riskCard || sidecars.riskCard || null,
        multiply: sidecars.multiply || null,
        awaitingConfirmation: parsed.awaitingConfirmation === true,
      };
    } catch {
      return {
        message: raw.slice(0, 500),
        strategies: [], choices: [], transaction: null, tip: null, action: null, portfolio: null,
        tokenChart: sidecars.tokenChart || null, sentiment: sidecars.sentiment || null,
        crossVenueStrategy: sidecars.crossVenueStrategy || null,
        riskSnapshot: null, projection: null, riskCard: sidecars.riskCard || null, multiply: sidecars.multiply || null, awaitingConfirmation: false,
      };
    }
  }

  return {
    message: "I hit my thinking limit on this one. Try breaking it into simpler steps.",
    strategies: [], choices: [], transaction: null, tip: null, portfolio: null,
    tokenChart: sidecars.tokenChart || null, sentiment: null,
    crossVenueStrategy: null, projection: null, riskCard: null, multiply: sidecars.multiply || null, awaitingConfirmation: false,
  };
}

module.exports = { agentChat, agentChatStream };
