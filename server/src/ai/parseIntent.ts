// @ts-nocheck
const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "X-Title": "Homie DeFi Assistant",
  },
});

const SYSTEM_PROMPT = `You are Homie's intent parser. Given a user message about Solana DeFi, extract structured data.

Return ONLY valid JSON with these fields:
- intent: one of "stake", "lend", "swap", "yield", "portfolio_check", "balance_check", "unknown"
- amount: number or null (in SOL — if user says "all" or "everything", use the walletBalance provided)
- token: string (default "SOL")
- risk_level: "low", "medium", "high" (infer from context, default "low")
- details: string (any extra context)

IMPORTANT: The user's wallet is already connected. Never tell them to connect a wallet. Use walletBalance as the default amount when the user doesn't specify a number.

Examples:
"I have 5 SOL and want safe yields" → {"intent":"yield","amount":5,"token":"SOL","risk_level":"low","details":"user wants safe/conservative yields"}
"What is my balance?" → {"intent":"balance_check","amount":null,"token":"SOL","risk_level":"low","details":"user checking balance"}
"Swap 2 SOL to USDC" → {"intent":"swap","amount":2,"token":"SOL","risk_level":"low","details":"swap SOL to USDC"}
"I want to stake everything" → {"intent":"stake","amount":null,"token":"SOL","risk_level":"low","details":"user wants to stake full balance"}
"Put my SOL somewhere risky for max gains" → {"intent":"yield","amount":null,"token":"SOL","risk_level":"high","details":"user wants aggressive yield strategies"}`;

async function parseIntent(userMessage, walletContext = {}) {
  const { walletAddress, solBalance } = walletContext;

  const walletInfo = walletAddress
    ? `\n\nUser wallet: ${walletAddress}, Balance: ${solBalance !== null && solBalance !== undefined ? solBalance.toFixed(4) + " SOL" : "unknown"}`
    : "";

  const response = await client.chat.completions.create({
    model: "openai/gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT + walletInfo },
      { role: "user", content: userMessage },
    ],
    temperature: 0,
    response_format: { type: "json_object" },
  });

  return JSON.parse(response.choices[0].message.content);
}

module.exports = { parseIntent };