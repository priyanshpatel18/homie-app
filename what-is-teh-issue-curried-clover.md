# Homie — Sprint Plan (Reconciled)

> **Roles:** M = mobile (Bharath) · W = web (other dev) · B = both  
> **Submit Day 8. ~17-day polish buffer after.**  
> **This document reflects the actual codebase state as of reconciliation — not aspirations.**

---

## What Is Already Built

Before any day reads as "PENDING", know what the codebase already has — so no one rebuilds it.

### Server — largely done

| Feature | File | Status |
|---|---|---|
| Chat memory (SQLite) | `server/src/db/conversationStore.ts` | ✅ Schema + CRUD exist |
| Portfolio fetch (Helius DAS) | `server/src/data/fetchPortfolio.ts` | ✅ SPL + LST + Kamino positions |
| Live APY rates | `server/src/data/fetchRates.ts` | ✅ Marinade, Jito, Sanctum, Kamino, Jupiter Lend |
| Position monitor + alerts | `server/src/monitor/positionMonitor.ts` | ✅ 8 alert types |
| Playbook store (CRUD) | `server/src/monitor/playbookStore.ts` | ✅ Typed declarations + auth ledger |
| Activity log | `server/src/monitor/activityLog.ts` | ✅ Full |
| Plan compiler | `server/src/engine/planCompiler.ts` | ✅ Multi-step with rollback metadata |
| Kamino leverage builder | `server/src/engine/kaminoLeverageBuilder.ts` | ⚠️ Exists, marked "not recommended" — needs mainnet smoke |
| Risk engine | `server/src/engine/risk/` | ✅ Scoring, adapters, strategy suggestions |
| Expo push | `server/src/push/pushService.ts` | ✅ Token registration + alert management |
| Autopilot | `server/src/monitor/autopilotStore.ts` | ✅ Strategy targets persisted |
| **MISSING** | `/api/home/snapshot` | ❌ Not built |
| **MISSING** | `/api/home/idle-suggestion` | ❌ Not built |
| **MISSING** | `/api/home/daily-stats` | ❌ Not built |
| **MISSING** | `daily_stats` DB table | ❌ Not built |

### Web — foundation only

| Feature | Status |
|---|---|
| Marketing landing (`/`) | ✅ Complete |
| Chat UI (`/chat`) — ChatShell + ChatView + Composer + StrategyCard | ✅ Full, streaming, mode toggle |
| Blog scaffold | ✅ Structure done, content system TBD |
| `/app` four-tab shell | ❌ Does not exist |
| Practice toggle | ❌ Does not exist |
| Home tab (positions, stats, suggestions) | ❌ Does not exist |
| Positions tab + SL/TP cards | ❌ Does not exist |
| Automations tab (playbooks) | ❌ Does not exist |
| Onboarding questions (goal + verbosity) | ❌ Does not exist |

### Mobile — further along than the Notion assumed

| Feature | Status |
|---|---|
| Auth (Privy OAuth + wallet import + passcode) | ✅ Complete |
| HomeScreen (balance, portfolio USD, stat pills, mode picker, autopilot) | ✅ Works, but not yet a four-tab shell |
| ChatScreen — full DeFi chat + streaming + strategy cards + transaction signing | ✅ Complete |
| Sandbox / Practice mode | ✅ `sandboxEngine.js` + `SandboxBanner` + `SandboxDashboard` all exist |
| PositionsSheet | ✅ Lists open positions |
| PlaybookCard | ✅ Display component (creation modal pending) |
| MultiplyCard | ✅ Display component (mainnet wire-up pending) |
| AutopilotSheet | ✅ Full — allocation strategy config |
| TransactionPreview + SlideToConfirm | ✅ Full |
| Expo push notification setup | ✅ Token registration + handlers |
| **Learn mode (Duolingo)** | ✅ Built: `LearnScreen`, `LessonModal`, `TokenLearnCard`, `lessonCatalog`, `tokenExplainers`, `progressService` |
| Four-tab shell (Home, Positions, Automations, Chat) | ❌ HomeScreen is not yet restructured to tabs |
| Practice toggle in header (global, not per-screen) | ❌ Sandbox exists but not wired as a persistent header toggle |
| Per-position SL/TP card | ❌ Not built |
| Daily Stats card | ❌ Not built |
| Playbook creation modal ("contract" UI) | ❌ Not built |

---

## Note on Learn Mode (Mobile)

Days 1–3 of the previous sprint plan produced a Duolingo-style **Learn mode** (lesson catalog, step runner, token education cards, XP/streak persistence). This does **not** map to "Practice mode" in the new plan — they're different things:

- **Learn mode** = passive education, lesson cards, XP, Duolingo feel
- **Practice mode** = same UI as live, sandbox wallet, same agent, no real signing

Learn mode work is complete and kept. It sits behind the current `ModePickerSheet` (Learn vs Pro choice on first launch). In the new four-tab architecture, the recommended integration is: **Learn becomes a fifth optional tab on mobile** once the four core tabs are live. It does not block any of Days 1–8.

---

## Day-by-Day Plan (Updated)

### Day 1 — Four-Tab Shell

**Goal:** Kill chat-first. Both surfaces get Home / Positions / Automations / Chat tabs. Server persists memory.

**Web (W):**
- Create `/app` route with four-tab layout replacing the current `/chat`-only entry
- Practice toggle in top bar (toggle state in context, no server call yet — wires in Day 3)
- Home tab renders four slots (idle balance, positions, daily stats, suggestion) — all empty/loading skeletons for now
- Redirect `/chat` → `/app?tab=chat`

**Mobile (M):**
- Restructure `HomeScreen.js` into a bottom tab navigator: **Home | Positions | Automations | Chat**
- Move existing `ChatScreen` content under the Chat tab (no functional change to chat itself)
- Move existing `PositionsSheet` into the Positions tab (render inline, not as a bottom sheet)
- Practice toggle in the header (reads from AsyncStorage, no server call yet)
- Keep `LearnScreen` behind the existing ModePickerSheet — it's not part of the four tabs yet

**Server (B):**
- Verify `pushHistory` fires on every chat turn in `chat.routes.ts` — check both POST and GET paths
- Build `GET /api/home/snapshot` → returns `{ idleBalanceUsd, positionCount, dailyStatStub: null, topSuggestionStub: null }`

---

### Day 2 — Persona Onboarding + Idle Nudge

**Goal:** First open captures persona. Home shows one ranked idle suggestion in plain English.

**Web (W):**
- Onboarding sheet on `/app` first visit (two questions: goal → passive income / grow / explore; verbosity → explain everything / key insight / execute and report). Store in localStorage + POST to server
- Idle balance card on Home tab: shows unstaked SOL USD value + one suggestion with one-line rationale

**Mobile (M):**
- Merge `OnboardingSheet.js` + `RiskProfileSheet.js` into a single 4-step flow: goal → verbosity → risk → done. Write answers to server + AsyncStorage
- Idle balance card on Home tab (the same component, styled for mobile)
- Wire idle suggestion from `GET /api/home/idle-suggestion` to the suggestion slot

**Server (B):**
- Persona stored per wallet in a new `personas` table (goal, verbosity, risk — mirrors existing `agent_settings` shape)
- `GET /api/home/idle-suggestion` — reads wallet's idle SOL from portfolio, reads persona, ranks: Marinade → Kamino lend → Jupiter Lend by risk level. Returns `{ protocol, action, rationale, estimatedApyPct, preparedTxStub: null }`

---

### Day 3 — Practice Wallet End-to-End

**Goal:** Practice toggle routes everything through the sandbox with the same UI. Zero branching.

**Web (W):**
- Practice toggle wires: when `practice=true`, all `/api/chat` calls include `{ sandbox: true }` in wallet context
- Visible "PRACTICE" banner on Home tab when active
- Strategy card action buttons disabled-but-visible when no real signing

**Mobile (M):**
- Wire the Practice toggle in the header to `sandboxEngine.js` — all `askHomie` calls include `{ sandbox: true }` when toggled
- `SandboxBanner` already exists — mount it conditionally at the top of the Home and Chat tabs
- Positions tab shows sandbox positions (separate list) when practice is active
- `SandboxDashboard` already exists — surface it from the Home tab when practice is active

**Server (B):**
- When `walletContext.sandbox === true`, all tool calls (`fetchPortfolio`, `prepare_*_transaction`) read/write to a per-wallet sandbox state table instead of executing on-chain
- Sandbox state table: `wallet, token, balance, positions_json` — upserted on every sandbox trade
- Response shape identical to live — agent and UI need zero code branches

---

### Day 4 — Live Positions + Jupiter Trigger SL/TP

**Goal:** Positions tab shows live positions. Each position can have a stop-loss and take-profit attached.

**Web (W):**
- Positions tab: list cards per open position (protocol, pair, entry price, current P&L, health if Kamino)
- Per-position SL/TP card: price input for stop-loss, price input for take-profit, "Attach" button
- Web Push permission flow (browser `Notification.requestPermission`) — store subscription in server
- Push deep-link opens the position card when threshold is crossed

**Mobile (M):**
- Positions tab: same list cards — `PositionsSheet` content migrated inline
- Per-position SL/TP card — new component `PositionSlTpCard.js`
- Expo push deep-link already wired (`notifications.js`) — add position deep-link handler

**Server (B):**
- `prepare_trigger_order` tool in agent.ts: calls Jupiter Trigger API to create a SL or TP order against an existing position mint
- `positionMonitor.ts` — when a position closes (Kamino repay, unstake, etc.), cancel any orphan Trigger orders for that position
- Push on threshold cross: 1-minute debounce, include position ID in payload for deep-link

---

### Day 5 — Kamino Multiply + Multi-Step Plans *(PAIR)*

**Goal:** Headline demo strategy. Multiply card with live liquidation math. Multi-step plan previewed and cancellable.

**Web (W):**
- Multiply card: collateral picker (SOL / jitoSOL / mSOL), leverage slider 1.5x–3x, live liquidation distance, worst-case loss at −10/−20/−30% SOL
- Multi-step plan card: numbered steps, per-step preview (amount, output, fee), per-step receipt after confirmation, "Cancel plan" button

**Mobile (M):**
- Same Multiply card — `MultiplyCard.js` already exists as a display component, wire it to the agent's `open_kamino_leverage` tool
- Same multi-step plan card — `planCompiler.ts` already exists on server, build the mobile step-by-step UI

**Server (B):**
- `kaminoLeverageBuilder.ts`: smoke on mainnet, fix anything blocking — it's marked "not recommended" but needs to work
- `planCompiler.ts` already exists: verify rollback metadata is returned per step
- Re-quote Jupiter Ultra orders if the signed payload TTL is under 30 seconds
- Pair deliverable: open a 2x jitoSOL Multiply on mainnet from both surfaces. Record clip.

---

### Day 6 — Daily Stats Card

**Goal:** Home tab "what happened today" card. Yesterday in plain English.

**Web (W):**
- Daily Stats card on Home: PnL today, best move, worst move, idle drag USD, suggested next move
- One-line timestamp ("as of 8pm")

**Mobile (M):**
- Same card on Home tab
- One Expo push at the user's local 8pm: "Your Homie daily report is ready" → deep-link to Home tab

**Server (B):**
- Add `daily_stats` table to `database.ts`: `wallet, date, pnl_usd, best_move_json, worst_move_json, idle_drag_usd, suggestion_json`
- `GET /api/home/daily-stats/:wallet` aggregates today's `activity_log`, position deltas, idle balance, Kamino health changes. On first call of the day, compute and cache to `daily_stats`; subsequent calls return cached row
- Nightly job at 20:00 wallet-local: iterate all wallets with positions, compute stats, push Expo notification

---

### Day 7 — Playbooks *(PAIR)*

**Goal:** Pre-authorised, scoped automations. Two templates wired end-to-end.

**Web (W):**
- Playbook proposal modal: reads like a contract — asset, max size, condition, cooldown, expiry. Plain English, no jargon
- Automations tab on `/app`: list active playbooks with pause/cancel. Each card: template name, scope summary, last-fired, next eligible
- `/playbooks` explainer page: scoped, time-bound, auditable, revocable

**Mobile (M):**
- Same playbook proposal modal (bottom sheet) — `PlaybookCard.js` already exists for display, build the create/edit sheet
- Same Automations tab: active playbooks list with pause/cancel

**Server (B):**
- `playbookStore.ts` already has CRUD + conditions/actions/scope/cooldown/expiry — verify fire engine respects all fields
- Move-to-safety template: triggers on Kamino health < 1.15 → repay borrow → swap collateral to USDC
- DCA template: wires to Jupiter Recurring API — `POST /api/v2/recurring/orders`
- On fire: write receipt (tx signature, Solscan link) to activity_log, push Expo + Web Push
- Pair deliverable: authorise both templates from both surfaces. Force-fire move-to-safety on forked mainnet at −25% SOL. Record clip.

---

### Day 8 — Polish + Demo + Submission *(PAIR)*

**Web (W):**
- Final landing pass
- `/risk` and `/automations` explainer pages live
- Demo video embedded on landing
- DX report at `/dx-report` (2,500+ words including 600-word rebuild essay + AI stack section)
- Frontier Kamino integration page

**Mobile (M):**
- TestFlight build link + APK link live
- Final mainnet smoke: Practice toggle → persona onboarding → idle suggestion → Multiply open → SL attach → Daily Stats → playbook fire
- Learn mode regression check (still launches, lessons complete, XP saves)

**Server (B):**
- Backoff + jitter on Jupiter 429s (`fetchRates.ts` and transaction builders)
- Refresh Kamino reserves before every multiply close
- Audit log export endpoint with request IDs
- Feature flags for every shipped flow

**Submission:**
- Frontier on Superteam Earn under Kamino track (web URL = live app)
- Jupiter Developer Platform with DX report

---

## Cut List (Drop in this order if behind)

1. Day 6 Daily Stats push notification — in-app card only
2. Day 4 Web Push — in-app banner instead
3. Founder LinkedIn posts / second blog of any day
4. Day 7 DCA template — move-to-safety only
5. Day 5 multi-step plan rollback metadata — best-effort retry only
6. Learn mode as a tab — stays behind ModePickerSheet, not promoted to fourth tab

**Never cut:** Day 1 four-tab shell, Day 2 persona + idle nudge, Day 3 Practice Wallet, Day 4 SL/TP, Day 5 Multiply, Day 7 playbooks, Day 8 demo, DX report.

---

## Architecture After Day 1

```
App root (web: /app, mobile: HomeScreen)
│
├── Tab: Home        ← idle balance card, positions mini-list, daily stats, suggestions
├── Tab: Positions   ← live position cards + per-position SL/TP
├── Tab: Automations ← active playbooks + fire history
└── Tab: Chat        ← existing ChatScreen / ChatShell (unchanged)
│
Practice toggle (header) ──► sandbox=true in walletContext ──► server routes to sandbox state
```

Mobile additionally:
```
ModePickerSheet (first launch)
├── "Learn mode" → LearnScreen (Duolingo lessons — already built)
└── "Pro mode"  → four-tab shell above
```

---

## Vision Check (Before Any Push)

1. Which tab does this strengthen? (Home / Positions / Automations / Chat)
2. Does it work in Practice mode with zero branching?
3. Is it in this document? If not, it goes to backlog.
4. No silent days — each role appends to the DX report at end of day.
