# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Homie** is a Solana DeFi chatbot/agent assistant with on-chain execution.
Users chat with an AI agent that can read their portfolio, fetch live market
data and yield rates, and build/sign Solana transactions (staking via Marinade,
lending via Kamino, swapping via Jupiter, and more).

The repo is an `npm` workspaces + Turborepo monorepo:

- **`frontend/`** — Next.js (App Router) web frontend (workspace)
- **`mobile/`** — React Native + Expo iOS/Android app (**not** in the workspace; installed separately to avoid Metro/hoisting issues — uses `file:../sdk/homie-sdk` to consume the SDK)
- **`server/`** — Express.js agent backend (workspace)
- **`sdk/homie-sdk/`** — `@homie/sdk`, the typed client used by mobile and server (and any future web/extension) (workspace)
- **`packages/`** — internal shared workspace libraries (domain packages land here)

A root `.npmrc` sets `legacy-peer-deps=true` because some Solana SDK peer
ranges in `server/` conflict (e.g. `@orca-so/whirlpools` vs `@solana/kit`).
Don't remove that without verifying installs still resolve.

## Commands

Run all npm commands from the repo root unless noted otherwise.

### Bootstrap

```bash
npm install              # installs root + frontend + server + sdk workspaces
npm run mobile:install   # installs mobile (separate, outside workspace)
npm run sdk:build        # build @homie/sdk once so workspaces resolve dist/
```

### Backend server (`server/`)

```bash
npm run server:dev       # tsx watch (auto-reload)
npm run server:start     # production (no watch)
# Runs on http://0.0.0.0:3000
```

Required env: copy `server/.env.example` to `server/.env`. `LLM_API_KEY` is the
OpenRouter key. Optional: `JUP_API_KEY`, `BIRDEYE_API_KEY`, `SANCTUM_API_KEY`.

### Mobile app (`mobile/`)

```bash
npm run mobile:dev       # Expo dev server
npm run mobile:android   # Build + run on Android device/emulator
npm run mobile:ios       # Build + run on iOS (macOS + Xcode required)
npm run mobile:web       # Expo web target
```

`mobile/.env` exposes `EXPO_PUBLIC_API_URL` to the bundle. Use
`http://10.0.2.2:3000` for Android emulator, `http://localhost:3000` for iOS
simulator, or `http://<LAN-IP>:3000` for physical devices.

### Web frontend (`frontend/`)

```bash
npm run frontend:dev
npm run frontend:build
npm run frontend:lint
npm run frontend:start
```

### Shared SDK (`sdk/homie-sdk/`)

```bash
npm run sdk:build        # tsc → dist/
npm run sdk:dev          # tsc --watch
```

No test runner or lint configuration exists for the agent backend. The
frontend uses ESLint.

## Architecture

### Request flow

```
mobile (ChatScreen) ──► @homie/sdk ──► server /api/chat ──► agent.js (tool-calling loop)
                                                              ├── fetchPortfolio.js  (Solana RPC)
                                                              ├── fetchMarket.js     (CoinGecko/DeFiLlama/Birdeye)
                                                              ├── fetchRates.js      (APY rates — Marinade/Kamino/Jito/Sanctum)
                                                              ├── fetchJitoData.js   (jitoSOL APY + MEV stats)
                                                              ├── fetchSanctumData.js(INF APY + LST catalog)
                                                              ├── transactionBuilder.js (Marinade/Kamino/Jupiter SDKs)
                                                              ├── jitoBuilder.js     (Jito SOL→jitoSOL staking)
                                                              └── sanctumBuilder.js  (Sanctum INF staking + LST swaps)
                                                          ↓
                                                     OpenRouter (GPT-4o-mini via OpenAI SDK)
                                                          ↓
                                                 JSON response → StrategyCard + TransactionPreview UI
                                                          ↓
                                                 User confirms → Privy wallet signs → broadcast to Solana
```

### Backend (`server/`)

| File | Role |
|------|------|
| `index.js` | Express server. Routes: `GET /api/portfolio/:wallet`, `POST /api/chat`, `POST /api/chat/stream`. Maintains per-wallet conversation history (in-memory Map, last 20 messages). Falls back to `chat.js` if agent loop throws. |
| `src/ai/agent.js` | Core agentic loop. Calls LLM with tool definitions, executes tool calls, re-prompts — up to 5 rounds. The main intelligence layer. |
| `src/ai/llmConfig.js` | Shared OpenAI SDK client pointed at OpenRouter. Import this for any LLM calls. |
| `src/data/fetchPortfolio.js` | Reads SOL balance + SPL token accounts from Solana mainnet RPC. |
| `src/data/fetchMarket.js` | Aggregates live prices/TVL from CoinGecko, DeFiLlama, Birdeye. |
| `src/engine/transactionBuilder.js` | Builds unsigned Solana transactions for stake/swap/lend. Returns serialized tx for the client to sign. |
| `src/push/` | Expo push notification service + routes. |

**Dead code** (built but not integrated — do not delete without understanding intent):
- `src/ai/parseIntent.js` — intent classifier, not called anywhere
- `src/data/fetchRates.js` — APY fetcher, not wired into agent tools
- `src/engine/strategies.js` — rule-based strategy engine, not integrated
- `src/response/buildResponse.js` — response formatter, not used

### Mobile (`mobile/`)

| File | Role |
|------|------|
| `App.js` | Root: Privy provider + navigation. Routes to `OnboardingScreen` (unauthenticated) or `ChatScreen`. |
| `src/screens/ChatScreen.js` | Main UI. Manages message state, calls `services/api.js`, handles streaming SSE via XHR `onprogress`, renders strategy cards + TX confirmation modal. Contains `tradeMode` state: `"auto"` / `"ask"` / `"learn"`. |
| `src/screens/OnboardingScreen.js` | Privy auth (Google/Apple/Email). |
| `src/services/api.js` | HTTP client. `askHomie(walletAddress, message, history)` and `fetchPortfolio(walletAddress)`. The `@homie/sdk` workspace package is the migration target for these calls. |
| `src/components/StrategyCard.js` | Renders DeFi opportunity cards with action buttons. |
| `src/components/TransactionPreview.js` | TX confirmation modal. |
| `src/components/PremiumGradient.js` | GPU-accelerated gradient background via `@shopify/react-native-skia`. |

### Shared SDK (`sdk/homie-sdk/`)

`@homie/sdk` is a zero-runtime-deps TypeScript client. It exposes `init`,
`chat`, `chatStream`, `conversation`, and data fetchers (`fetchPortfolio`,
`fetchPrices`, `fetchChart`, `fetchRates`, `fetchSentiment`, `fetchEmbedding`).
Server and frontend depend on it via `"@homie/sdk": "*"` (resolved through npm
workspaces). Mobile, which lives outside the workspace, depends on it via
`"@homie/sdk": "file:../sdk/homie-sdk"` so Metro can resolve it without
relying on hoisting.

### LLM configuration
- Provider: OpenRouter (`https://openrouter.ai/api/v1`)
- Model: `openai/gpt-4o-mini`
- API key: `LLM_API_KEY` in `server/.env`
- Streaming: `POST /api/chat/stream` returns SSE events with tool-call progress updates

### UI conventions
- Dark glassmorphic theme: black base + semi-transparent white overlays (7–14% opacity)
- Accent: `#4ADE80` (green) for success/active states
- Section headers in code use `─── Title ───────` divider style

## Workspace Boundaries

- Mobile and server consume `@homie/sdk`. Server-only Solana SDK code (Kamino,
  Marinade, Jupiter builders) stays in `server/src/engine/`. Anything reusable
  by the web frontend should be promoted into `sdk/homie-sdk/` or a new
  `packages/<name>/` package.
- Don't import server internals from mobile or frontend; cross the boundary via
  HTTP through `@homie/sdk`.
- New shared libraries: `packages/<name>/` for internal-only, `sdk/<name>/`
  for publishable.
