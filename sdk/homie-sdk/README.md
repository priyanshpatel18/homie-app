# @homie/sdk

Minimal TypeScript client SDK for the Homie AI agent backend.  
Zero runtime dependencies. Works in React Native and web.

## Setup

```ts
import { init } from "@homie/sdk";

init({ baseUrl: "https://api.homie.app" });
// or local dev:
init({ baseUrl: "http://localhost:3000" });
```

## Chat (one-shot)

```ts
import { chat } from "@homie/sdk";

const res = await chat({
  message: "What's the best SOL staking yield right now?",
  wallet: { walletAddress: "abc...", solBalance: 12.5 },
});

console.log(res.reply);       // AI response text
console.log(res.strategies);  // DeFi strategies (if any)
console.log(res.transaction);  // Unsigned tx to sign (if any)
```

## Chat (streaming)

Real-time status updates as the agent calls tools:

```ts
import { chatStream } from "@homie/sdk";

const result = await chatStream(
  { message: "Swap 1 SOL to USDC" },
  {
    onStatus: (s) => console.log("⏳", s),  // "Checking prices..."
    onResult: (r) => console.log("✅", r),
  },
);
```

## Managed conversation

Auto-manages message history:

```ts
import { conversation } from "@homie/sdk";

const convo = conversation({ walletAddress: "abc..." });

const r1 = await convo.send("What's my balance?");
const r2 = await convo.send("Stake half my SOL");
// history is tracked automatically

// Or with streaming:
const r3 = await convo.sendStream("Show me yields", {
  onStatus: (s) => setLoadingText(s),
});
```

## Data endpoints

```ts
import {
  fetchPortfolio,
  fetchPrices,
  fetchChart,
  fetchRates,
  fetchSentiment,
  fetchEmbedding,
} from "@homie/sdk";

// Portfolio
const portfolio = await fetchPortfolio("wallet...");

// Token prices
const prices = await fetchPrices(["So11...", "EPjF..."]);

// Price chart
const chart = await fetchChart("SOL", "7D");

// Yield rates
const rates = await fetchRates();

// Sentiment
const sentiment = await fetchSentiment("SOL");

// Embeddings
const { embedding } = await fetchEmbedding("defi staking solana");
```

## Error handling

```ts
import { HomieApiError } from "@homie/sdk";

try {
  await chat({ message: "..." });
} catch (err) {
  if (err instanceof HomieApiError) {
    console.log(err.status); // 429, 500, etc.
    console.log(err.body);   // server error payload
  }
}
```

## Abort requests

```ts
const controller = new AbortController();

// Cancel after 5s
setTimeout(() => controller.abort(), 5000);

await chat({ message: "..." }, controller.signal);
```

## Structure

```
packages/sdk/
├── src/
│   ├── index.ts    ← barrel export
│   ├── types.ts    ← all shared types
│   ├── client.ts   ← init(), fetch wrapper, HomieApiError
│   ├── chat.ts     ← chat(), chatStream(), conversation()
│   └── data.ts     ← fetchPortfolio, fetchPrices, fetchChart, etc.
├── dist/           ← compiled JS + .d.ts
├── package.json
└── tsconfig.json
```
