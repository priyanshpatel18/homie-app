// @ts-nocheck
/**
 * Unified chat handler.
 * Injects all live market context into a single LLM call and returns
 * a structured response: { message, strategies[], tip }
 */

const { fetchMarketContext } = require("../data/fetchMarket");
const { client, LLM_MODEL } = require("./llmConfig");

const SYSTEM_PROMPT = `You are Homie — a sharp, concise Solana DeFi co-pilot. You have real-time access to:
- The user's connected wallet balance, SPL tokens, and open protocol positions
- Live SOL price and 24h price change
- Live APYs from Marinade Finance and Kamino Lend
- The top 15 highest-TVL Solana yield pools right now (from DeFiLlama)
- The top 8 trending tokens on Solana right now (from Birdeye)

Your job is to give sharp, specific, actionable advice — NOT generic DeFi education.
Always reference the actual live numbers in your response (prices, APYs, pool names).
If asked about news or alpha, summarize what the trending and pool data implies about where smart money is moving.
If asked where to invest, rank options by risk/reward using the live pool data.

IMPORTANT — always respond in this exact JSON format:
{
  "message": "your conversational response (2-4 sentences max, direct and specific)",
  "strategies": [
    {
      "protocol": "protocol name",
      "action": "exactly what to do",
      "amount": number or null,
      "estimated_apy": "X%" or null,
      "risk": "low" | "medium" | "high",
      "why": "one sentence reason",
      "url": "https://..."
    }
  ],
  "tip": "one sharp insight or warning (optional, null if nothing important)"
}

Rules:
- strategies array can be empty [] if the question is informational
- Keep message under 4 sentences — be direct, not wordy
- Never say "connect your wallet" — it is already connected
- Never make up APYs — only use numbers from the live data provided
- If the user asks about a token not in the data, say you don't have live data on it
- Use the trade mode: "auto" = execute now, "ask" = confirm first, "learn" = explain only`;

function buildMarketBlock(market) {
  const lines = [];

  if (market.sol) {
    const dir = market.sol.change24h >= 0 ? "+" : "";
    lines.push(`SOL price: $${market.sol.usd} (${dir}${market.sol.change24h}% 24h)`);
  }

  if (market.rates?.marinadeApy) lines.push(`Marinade mSOL APY: ${market.rates.marinadeApy}%`);
  if (market.rates?.kaminoSolApy) lines.push(`Kamino SOL lending APY: ${market.rates.kaminoSolApy}%`);
  if (market.rates?.kaminoUsdcApy) lines.push(`Kamino USDC lending APY: ${market.rates.kaminoUsdcApy}%`);

  if (market.topPools?.length) {
    lines.push("\nTop Solana yield pools right now (DeFiLlama):");
    for (const p of market.topPools.slice(0, 10)) {
      lines.push(`  ${p.protocol} — ${p.pool} | APY: ${p.apy}% | TVL: $${p.tvlM}M | IL risk: ${p.ilRisk}`);
    }
  }

  if (market.trending?.length) {
    lines.push("\nTrending tokens on Solana right now (Birdeye):");
    for (const t of market.trending) {
      const chg = t.change24h !== null ? ` | 24h: ${t.change24h > 0 ? "+" : ""}${t.change24h?.toFixed(1)}%` : "";
      const vol = t.volume24hM !== null ? ` | Vol: $${t.volume24hM}M` : "";
      lines.push(`  ${t.symbol} — $${t.price?.toFixed(4) ?? "?"}${chg}${vol}`);
    }
  }

  return lines.join("\n");
}

function buildWalletBlock(walletContext) {
  const { walletAddress, solBalance, portfolio } = walletContext;
  if (!walletAddress) return "No wallet connected.";

  const lines = [`Wallet: ${walletAddress}`];
  if (solBalance !== null && solBalance !== undefined) {
    lines.push(`SOL balance: ${Number(solBalance).toFixed(4)} SOL`);
  }

  if (portfolio?.tokens?.length) {
    lines.push("SPL tokens: " + portfolio.tokens.map((t) => `${t.balance.toFixed(4)} ${t.symbol}`).join(", "));
  }

  if (portfolio?.positions?.length) {
    lines.push("Open positions:");
    for (const pos of portfolio.positions) {
      if (pos.type === "liquid_stake") {
        lines.push(`  ${pos.protocol ?? "Staking"}: ${pos.description}`);
      } else if (pos.type === "lending") {
        const dep = pos.deposits.map((d) => `${d.amount.toFixed(4)} ${d.token}`).join(", ");
        lines.push(`  Kamino Lend: deposited ${dep || "—"}`);
      }
    }
  }

  return lines.join("\n");
}

async function chat(userMessage, walletContext = {}) {
  const market = await fetchMarketContext();

  const systemMessage = [
    SYSTEM_PROMPT,
    "\n\n--- LIVE MARKET DATA ---",
    buildMarketBlock(market),
    "\n--- USER WALLET ---",
    buildWalletBlock(walletContext),
    `\nTrade mode: ${walletContext.tradeMode ?? "ask"}`,
    `Data freshness: ${market.fetchedAt}`,
  ].join("\n");

  const response = await client.chat.completions.create({
    model: LLM_MODEL,
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: userMessage },
    ],
    temperature: 0.4,
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0].message.content;

  try {
    const parsed = JSON.parse(raw);
    return {
      message: parsed.message ?? "I ran into an issue. Try again.",
      strategies: Array.isArray(parsed.strategies) ? parsed.strategies : [],
      tip: parsed.tip ?? null,
    };
  } catch {
    return {
      message: raw.slice(0, 500),
      strategies: [],
      tip: null,
    };
  }
}

module.exports = { chat };