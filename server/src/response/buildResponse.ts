// @ts-nocheck
/**
 * Response Builder — turns strategies into friendly, jargon-free messages.
 */

function buildResponse(intent, strategies, walletContext = {}) {
  const { solBalance } = walletContext;
  const bal = solBalance !== null && solBalance !== undefined ? `${Number(solBalance).toFixed(4)} SOL` : null;

  const FRIENDLY_MESSAGES = {
    stake: `Here's how I'd put your ${bal ?? "SOL"} to work with staking:`,
    lend: `Here's what lending looks like for you:`,
    swap: "I found the best route for your swap:",
    yield: `Here are some yield options for your ${bal ?? "SOL"}, sorted from safest to spiciest:`,
    balance_check: bal
      ? `Your balance is ${bal}. Here's what I'd suggest doing with it:`
      : "Your wallet is connected but the balance is still loading. Try again in a moment.",
    portfolio_check: bal
      ? `Here's your portfolio snapshot — you're holding ${bal}:`
      : "Let's take a look at your portfolio:",
    unknown: "I'm not 100% sure what you need, but here's what I can help with:",
  };

  const message = FRIENDLY_MESSAGES[intent.intent] || FRIENDLY_MESSAGES.unknown;

  // Build a plain-English summary
  const summary = strategies.map((s, i) => {
    let line = `${i + 1}. **${s.protocol}** — ${s.action}`;
    if (s.estimated_apy) line += ` (~${s.estimated_apy} APY)`;
    if (s.risk) line += ` [${s.risk} risk]`;
    return line;
  }).join("\n");

  return {
    message,
    summary,
    strategies,
    parsed_intent: intent,
    tip: getTip(intent),
  };
}

function getTip(intent) {
  const tips = {
    stake: "Liquid staking (mSOL) lets you earn staking rewards AND use your tokens in DeFi. It's like having your cake and eating it too.",
    lend: "Lending is one of the safest DeFi strategies. Your tokens earn interest from borrowers, and most protocols let you withdraw anytime.",
    swap: "Jupiter checks every DEX on Solana to find you the best price. Always double-check the slippage before confirming.",
    yield: "Higher APY usually means higher risk. If something promises 50%+ APY, ask yourself where that yield is coming from.",
    portfolio_check: "Regular portfolio check-ins help you catch problems early. I'll flag anything that looks off.",
  };
  return tips[intent.intent] || "Not sure where to start? Just tell me how much SOL you have and whether you want to play it safe or go aggressive.";
}

module.exports = { buildResponse };