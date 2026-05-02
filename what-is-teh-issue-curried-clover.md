# Homie — 9-Day Sprint Plan (Duolingo Frame Applied)

## The Frame

**The teaching is embedded in the action, not separate from it.** No lesson screens. No XP bars. Every execution comes with narration — in your numbers, in plain language. The more you use it, the smarter it gets about you. Three modes, one app:

- **Learn** = Guide mode. Homie leads, explains what's about to happen in your actual numbers before executing.
- **Ask** = Copilot mode. User leads. Homie executes + adds one sharp insight.
- **Auto** = Autopilot mode. Homie manages. Reports what it did and why.

The toggle already exists on web (`frontend/components/chat/composer.tsx`) and is sent to the server — but **the agent currently ignores it**. That's the core Day 2 unlock.

---

## What's Already Built (Don't Rebuild)

| Feature | File | Status |
|---|---|---|
| Live rates injected into every LLM call | `server/src/ai/agent.ts` → `buildLiveRatesCtx()` | ✅ Done |
| Idle SOL alert injected into LLM | `server/src/ai/agent.ts` → `buildIdleCtx()` | ✅ Done |
| tradeMode sent from web to server | `frontend/components/chat/chat-view.tsx:90` | ✅ Sent, ignored |
| tradeMode toggle UI (Ask/Auto/Learn) | `frontend/components/chat/composer.tsx` | ✅ Exists |
| tradeMode in WalletContext type | `sdk/homie-sdk/src/types.ts` | ✅ Typed |
| Profile (risk/goal/experience) → LLM | `server/src/ai/agent.ts` → `profileToContext()` | ✅ Done |
| Activity log (all confirmed actions) | `server/src/monitor/activityLog.ts` | ✅ Done |
| Yield projection math (backward) | `mobile/src/services/pnlService.js` → `computeTradePnL()` | ✅ Exists |
| Sandbox mode (paper trading) | `mobile/src/sandbox/sandboxEngine.js` | ✅ Full |
| Autopilot (set strategy, drift alerts) | `server/src/monitor/autopilotStore.ts` | ✅ Done |
| Position monitoring (8 alert types) | `server/src/monitor/positionMonitor.ts` | ✅ Done |

---

## Day 1 — Foundation

### 1A. Conversation Memory Persistence

**Problem:** Conversation history lives in an in-memory Map in `server/src/index.ts` — dies on restart.

**Files:**
- `server/src/db/conversationStore.ts` — already exists with `getHistory` / `pushHistory` using SQLite `conversations` table
- `server/src/api/chat.routes.ts` — already calls `getHistory(walletAddress)` and `pushHistory()`
- **The table and functions exist. Verify they're actually being called on both GET (history load) and POST (save after response).** The bug is likely that client-side history takes priority and never falls back to DB. Fix: always persist to DB regardless of whether client sent history.

**Change in `chat.routes.ts`:**
```typescript
// After response, always save to DB
pushHistory(walletAddress, message, response);  // already there — verify this runs
```

### 1B. Two Onboarding Questions

**What:** When user first opens Chat, after the current 4-step carousel (`OnboardingSheet.js`), ask 2 questions that seed the tradeMode default:
1. "What's your DeFi goal?" → passive income / grow my bag / just exploring
2. "How much do you want explained?" → "Show me everything (Learn)" / "Just the key insight (Ask)" / "Execute and report (Auto)"

**File:** `mobile/src/components/OnboardingSheet.js` — add steps 5 and 6 to the existing `STEPS` array. Map Q2 answer to initial `tradeMode` state in ChatScreen.

**Note:** `RiskProfileSheet.js` already collects risk + goal + experience on first Chat entry. Either combine into one flow or make OnboardingSheet Q1 feed into RiskProfile so they share state.

### 1C. Virtual-Wallet Projector (Server)

**What:** Given a wallet's current balances and a strategy (e.g. "stake SOL on Marinade"), project portfolio value over 30/60/90 days under three scenarios.

**Reuse:** `mobile/src/services/pnlService.js` has the yield math (`entryUsd * apy * days/365`). Port this logic server-side.

**New file:** `server/src/data/projectPortfolio.ts`

```typescript
export function projectYield(params: {
  amountUsd: number;
  apy: number;         // from live rates (already fetched)
  solPriceUsd: number; // from rates.sol_price_usd
  days: 30 | 60 | 90;
  scenarios: { bull: number; base: number; bear: number }; // SOL price multipliers
}): { bull: ProjectionResult; base: ProjectionResult; bear: ProjectionResult }
```

**Agent tool:** Add `project_portfolio` tool to TOOLS array in `agent.ts`. The agent calls it when user asks "what would I earn if I staked X for 30 days" or when presenting a strategy in Learn mode.

**Response field:** Add `"projection": null | { days, scenarios }` to agent JSON response. Frontend renders a simple bar chart.

---

## Day 2 — Risk Gating + Learn Mode (The Core Mode Unlock)

### 2A. Wire tradeMode into Agent

**The gap:** `tradeMode` arrives in `walletContext` but `agentChat` / `agentChatStream` never use it.

**File:** `server/src/ai/agent.ts`

Add `buildModeCtx(tradeMode)` alongside existing context builders:

```typescript
function buildModeCtx(tradeMode: string | undefined): string {
  if (tradeMode === "learn") {
    return `\n\nMODE: LEARN — User wants maximum context. Before every execution: 1 sentence using their exact numbers (amount, output, APY, time). Underline jargon terms inline as [term: plain explanation]. After execution: narrate what changed in their wallet + what they now earn per day/month. Keep each part to 1-2 sentences — explanations are brief, not lectures.`;
  }
  if (tradeMode === "auto") {
    return `\n\nMODE: AUTO — User is experienced. Execute concisely. One-line reports only. Proactively flag drift, better rates, risks — without waiting to be asked.`;
  }
  // "ask" is default
  return `\n\nMODE: ASK — User leads. Execute efficiently. Add ONE sharp insight where it genuinely helps: a better rate, a hidden risk, a smarter comparison. Skip explanations of basics.`;
}
```

Inject in both `agentChat` and `agentChatStream` (alongside the rates and idle ctx already there):

```typescript
const modeCtx = buildModeCtx(tradeMode);
// Add ${modeCtx} to walletInfo string
```

### 2B. Post-Execution Narration (Learn Mode Key Feature)

**What:** After every confirmed transaction, Homie automatically narrates what just happened in real numbers.

**Trigger:** Mobile sends `__post_tx__:{...metadata}` as the next chat message after tx confirmation.

**In agent.ts SYSTEM_PROMPT**, add:
```
POST-EXECUTION NARRATION:
When message starts with "__post_tx__:", parse the JSON metadata.
Generate 1-2 sentences: what changed in wallet (X SOL → X mSOL), what they now earn ($/month at current rates and SOL price). In Learn mode: add one grounding sentence ("you're now earning automatically — nothing to do"). Never mention "__post_tx__" in your response.
```

**Mobile change:** In `ChatScreen.js`, after tx confirmation callback fires, send `__post_tx__:{type,protocol,amount,token,outputToken,estimatedOutput}`.

### 2C. Risk Gating — Three Tiers

**New file:** `server/src/data/riskGate.ts`

```typescript
export type RiskTier = "safe" | "warn" | "severe";

export function evaluateRisk(protocol: string, action: string, amountUsd: number): {
  tier: RiskTier;
  reasons: string[];
}
```

Logic:
- **safe:** established protocols (Marinade, Kamino main market, Jupiter Lend), amount < $1000
- **warn:** newer protocols, LP positions (IL risk), amount $1000-$5000
- **severe:** leverage positions, unverified mints, amount > $5000 or concentrated bet

**Agent integration:** Before calling `prepare_*_transaction` tools, agent receives risk tier from `evaluateRisk`. In Learn mode: always show risk reasons. In Ask mode: show for warn/severe. In Auto mode: show only for severe.

**Response field:** Add `"riskCard": null | { tier, reasons }` to agent JSON response. Frontend renders inline alongside strategy card.

---

## Day 3 ★ — Multi-Step Plans + Multiply UX (PAIR)

### 3A. Plan Compiler

**New file:** `server/src/engine/planCompiler.ts`

Takes a multi-step strategy (e.g. unstake → swap → lend) and returns:
```typescript
interface CompiledPlan {
  steps: PlanStep[];
  totalSteps: number;
  rollbackInstructions: string[];
  estimatedTotalUsd: number;
}
interface PlanStep {
  index: number;
  label: string;
  protocol: string;
  serializedTx: string;
  estimatedOutput: string;
  solscanLink?: string;  // populated after confirmation
}
```

**Agent SYSTEM_PROMPT addition:** When user requests a multi-step strategy, the agent builds the full plan first (calls tools in sequence), then returns it as `transaction_bundle`. In Learn mode: each step includes a plain-English "what this does" line.

### 3B. Kamino Multiply Card

**New agent tool:** `open_kamino_leverage` already exists. Add a dedicated Multiply card render on mobile.

**Mobile:** `mobile/src/components/MultiplyCard.js` (new) — collateral picker, leverage slider 1.5x–3x, live liquidation price, worst-case loss at −10/−20/−30% SOL. Rendered when agent returns `transaction.type === "kamino_multiply"`.

---

## Day 4 — Playbook System

### 4A. Typed Playbook Declarations

**New file:** `server/src/monitor/playbookStore.ts`

```typescript
interface Playbook {
  id: string;
  wallet: string;
  type: "move_to_safety" | "dca" | "compound";
  conditions: PlaybookCondition[];   // e.g. { metric: "health_factor", op: "<", value: 1.15 }
  actions: PlaybookAction[];         // typed action declarations
  maxAmountUsd: number;
  cooldownHours: number;
  expiresAt: number;
  authorizedAt: number;
}
```

**DB table:** `playbooks` (wallet, id, config_json, active, authorized_at, last_fired_at)

### 4B. Authorization Ledger

Every playbook authorization stored with: timestamp, scope (max amount, expiry), wallet signature (or explicit confirm tap). No blank checks — scope is declared before authorization.

**Endpoints in `monitorRoutes.ts`:**
```
POST /api/monitor/playbooks          — create + authorize
GET  /api/monitor/playbooks/:wallet  — list active
DELETE /api/monitor/playbooks/:wallet/:id — cancel
```

### 4C. DCA Starter Template

Wire Jupiter Recurring API into a playbook template. The agent proposes a playbook (not just a one-shot DCA order) when user says "invest $X every week."

---

## Day 5 ★ — Headline Atomic Plan (PAIR)

**The demo centerpiece:** Kamino Multiply + Jupiter Trigger stop-loss + move-to-safety playbook — one consent, three legs.

### Wiring:

1. `open_kamino_leverage` → builds multiply tx
2. After multiply confirmed, agent auto-proposes: "Want me to attach a stop-loss that automatically protects this position?"
3. User says yes → `create_oco_order` for the stop-loss leg
4. Agent also registers a `move_to_safety` playbook in the background (repay Kamino + swap to USDC if health < 1.15)

**In Learn mode:** Each leg is narrated before execution. "Step 1: Opening a 2x jitoSOL position. Your 3 SOL becomes 6 SOL exposure — you earn double the staking yield but if SOL drops 35%, this position gets liquidated." Confirmation required per step.

**In Auto mode:** Single consent for the whole plan. Signatures per step, no narration between.

**Stale Trigger reconciliation:** On `positionMonitor.ts` run loop, if multiply position is closed, cancel orphan Trigger.

---

## Day 6 — Web Push + Simulate-in-Ask

### Simulate tap in Ask mode:

When agent returns strategies (in Ask mode), frontend shows "Simulate" button on each strategy card. On tap → calls `project_portfolio` tool → renders 30/60/90 bar chart inline.

This reuses the `projectPortfolio.ts` built on Day 1.

### Web Push:

**Server:** `server/src/push/` already has Expo push. Add web push (`web-push` npm package). Same payload contract.

**Frontend:** Permission request on `/app`. `ServiceWorker` receives push and opens position card via deep link.

---

## Day 7 — Automations Tab + Audit Log

### Mobile Automations tab:

Lists active playbooks (from `GET /api/monitor/playbooks/:wallet`) + activity log (from `GET /api/monitor/activity/:wallet`).

Two sub-views:
- **Active:** each playbook card with pause/cancel, last-fired timestamp, scope summary
- **History:** activity log entries with status (confirmed/failed), Solscan links, "auto" badge if agent-initiated

In Learn mode: each playbook card includes a 1-line plain-English description of what it does.

### Agent loop optimization:

In `agent.ts` tool execution loop, identify independent tool calls (e.g. `fetchPortfolio` + `fetchLiveRates`) and run them with `Promise.all`. Currently they're sequential.

---

## Day 8 ★ — Polish + Demo (PAIR)

- Final mainnet smoke: Learn mode stake → narration → copilot lend → autopilot headline plan
- Backoff + jitter on Jupiter 429s (in `server/src/data/fetchRates.ts` and transaction builders)
- DX report locked (Frontier + Jupiter tracks)
- Demo video: 3 users, 1 app, 3 stages of the journey

---

## Day 9 — Submission

- Frontier on Superteam Earn (Kamino track + web app URL)
- Jupiter Developer Platform
- All 9 blogs live
- DX report public

---

## Critical Files Map

| Day | File | Change |
|---|---|---|
| 1 | `server/src/api/chat.routes.ts` | Verify `pushHistory` always fires |
| 1 | `mobile/src/components/OnboardingSheet.js` | Add steps 5-6 (goal + verbosity questions) |
| 1 | `server/src/data/projectPortfolio.ts` | **NEW** — forward yield projection |
| 1 | `server/src/ai/agent.ts` | Add `project_portfolio` tool + response field |
| 2 | `server/src/ai/agent.ts` | Add `buildModeCtx()`, inject tradeMode, post-tx narration rule |
| 2 | `mobile/src/screens/ChatScreen.js` | Send `__post_tx__` after tx confirmed |
| 2 | `server/src/data/riskGate.ts` | **NEW** — 3-tier risk evaluation |
| 3 | `server/src/engine/planCompiler.ts` | **NEW** — multi-step plan with rollback |
| 3 | `mobile/src/components/MultiplyCard.js` | **NEW** — leverage/multiply UI |
| 4 | `server/src/monitor/playbookStore.ts` | **NEW** — playbook CRUD |
| 4 | `server/src/db/database.ts` | Add `playbooks` table |
| 4 | `server/src/monitor/monitorRoutes.ts` | Add playbook endpoints |
| 5 | `server/src/ai/agent.ts` | Atomic plan wiring (multiply + stop-loss + playbook) |
| 5 | `server/src/monitor/positionMonitor.ts` | Stale Trigger reconciliation |
| 6 | `server/src/push/` | Web push delivery |
| 7 | `mobile/src/screens/ChatScreen.js` | Automations tab (new tab or sheet) |

---

## Never Cut

- Day 2 risk gating (safety) + Learn mode (product soul)
- Day 3 plan compiler + multiply (headline feature)
- Day 5 atomic plan (demo centerpiece)
- Day 8 demo cut + DX report

## Cut First If Behind

1. Day 6 simulation chart on web (mobile-only fallback)
2. Day 6 Web Push (in-app banner instead)
3. The second blog of any flagship day
4. Day 1 projector: Marinade only (skip Kamino lending scenario)
