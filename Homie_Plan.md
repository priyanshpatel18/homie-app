Submit on Day 8. Hackathon deadline buys roughly 17 days of buffer after that for fixes and polish.

**Reframe:** chat is no longer the face. Home is. Practice toggle sits on top of the whole app. Every flow exists in real and practice mode with the same UI.

**Four tabs:** Home, Positions, Automations, Chat.

**Roles:** M = mobile + server + on-chain. W = web + content + DX. B = both.

**Pair days:** 5, 7, 8.

---

## **Day 1 — Reframe shell**

Theme: kill the chat-first home. Build the four-tab shell. Make memory stick.

Features:

- web: replace `/app` chat-first layout with a four-tab shell (Home, Positions, Automations, Chat). Practice toggle in the top bar. Home renders idle balance slot, positions slot, daily stats slot, suggestion slot — all loading skeletons for now. Redirect `/chat` → `/app?tab=chat`.
- mobile: restructure `HomeScreen.js` into a bottom tab navigator — Home, Positions, Automations, Chat. Move existing `ChatScreen` under the Chat tab (no functional changes to chat itself). Move `PositionsSheet` content inline into the Positions tab. Practice toggle in the header persisted to AsyncStorage — visual only this day. `LearnScreen` stays behind the existing `ModePickerSheet`, it is not part of the four tabs.
- server: verify `pushHistory` fires on every turn in `chat.routes.ts` — the SQLite `conversations` table and `conversationStore.ts` already exist, confirm both GET and POST paths call it. Add `GET /api/home/snapshot` returning `{ idleBalanceUsd, positionCount, dailyStatStub: null, topSuggestionStub: null }`.

---

## **Day 2 — Persona onboarding + idle nudge**

Theme: first open captures persona. Idle balance gets one ranked suggestion in plain English.

Features:

- web: onboarding sheet on `/app` first visit — two questions: goal (passive income / grow / explore) and verbosity (explain everything / key insight / execute and report). Store in localStorage and POST to server. Idle balance card on Home with one suggestion and a one-line rationale pulled from `GET /api/home/idle-suggestion`.
- mobile: consolidate the existing `OnboardingSheet.js` and `RiskProfileSheet.js` into a single 4-step flow — goal, verbosity, risk, done. Both components already exist, this is a merge and polish. Wire the idle balance card on the Home tab to `GET /api/home/idle-suggestion`.
- server: add a `personas` table (wallet, goal, verbosity, risk — mirrors the `agent_settings` shape). `GET /api/home/idle-suggestion` reads idle SOL balance from portfolio, reads persona, ranks Marinade stake → Kamino lend → Jupiter Lend by risk level. Returns `{ protocol, action, rationale, estimatedApyPct, preparedTxStub: null }`. Ranking logic can reuse the existing `risk/strategyEngine.ts`.

---

## **Day 3 — Practice Wallet end-to-end**

Theme: same UI, same flows, same agent. Practice toggle routes everything through the sandbox.

Features:

- web: wire the Practice toggle so every `/api/chat` call includes `{ sandbox: true }` in wallet context. Visible "PRACTICE" badge on Home tab when active. Strategy card action buttons are shown but do not trigger signing in practice mode.
- mobile: wire the header Practice toggle to `sandboxEngine.js` — `sandboxEngine.js`, `SandboxBanner.js`, and `SandboxDashboard.js` all already exist. Mount `SandboxBanner` conditionally on Home and Chat tabs. Show sandbox positions in the Positions tab when practice is active. Surface `SandboxDashboard` from the Home tab when practice is active. The wiring is what remains, not the components.
- server: when `walletContext.sandbox === true`, all tool calls read and write to a per-wallet sandbox state table instead of executing on-chain. Schema: `wallet, token, balance, positions_json`. Response shape is identical to live — the agent and UI need zero branching. The `sandbox` flag is already carried through `walletContext`; the state table is what is new.

---

## **Day 4 — Live positions + Jupiter Trigger SL/TP**

Theme: live position monitor with stop-loss attached the way a trader sets one.

Features:

- web: Positions tab listing live positions — protocol, pair, entry price, current P&L, health factor if Kamino. Per-position SL/TP card with stop-loss price input, take-profit price input, and an Attach button. Web Push permission flow — store the subscription on the server. Push deep-links open the position card directly.
- mobile: migrate `PositionsSheet` content inline into the Positions tab (the sheet already exists, this is a layout move). Add a `PositionSlTpCard.js` component per position for SL and TP inputs. The Expo push deep-link handler already exists in `notifications.js` — extend it with a position-card route.
- server: add a `prepare_trigger_order` tool in `agent.ts` that calls the Jupiter Trigger API to create a stop-loss or take-profit order against an open position's mint. `positionMonitor.ts` already runs — add logic: when a position closes, cancel any orphan Trigger orders for that position. Push on threshold cross with a one-minute debounce — push infrastructure already exists, add the position ID to the payload for the deep-link.

---

## **Day 5 — Kamino Multiply + multi-step plans (PAIR)**

Theme: headline strategy. Multiply card with liquidation math. Multi-step plan compiled, previewed, cancellable.

Features:

- web: Multiply card — collateral picker (SOL, jitoSOL, mSOL), leverage slider 1.5x to 3x, live liquidation distance, worst-case loss at −10/−20/−30 percent SOL. Multi-step plan card — numbered steps, per-step preview, per-step cost, Cancel plan button.
- mobile: wire `MultiplyCard.js` (already exists as a display component) to the agent's `open_kamino_leverage` tool. Build the multi-step plan step-by-step UI — `planCompiler.ts` on the server already returns ordered steps with per-step receipts and rollback metadata.
- server: smoke `kaminoLeverageBuilder.ts` on mainnet and fix anything blocking — it exists but is flagged as unverified. `planCompiler.ts` is already complete — confirm rollback metadata is returned per step. Add re-quote logic: if a Jupiter Ultra signed payload TTL is under 30 seconds, re-fetch the quote before submitting.
- pair: open a 2x jitoSOL Multiply on mainnet from web and from mobile. Capture clip.

---

## **Day 6 — Daily Stats**

Theme: end-of-day report card. Yesterday in plain English. PnL, best move, worst move, idle drag, what Homie would do tomorrow.

Features:

- web: Daily Stats card on Home rendering PnL today, best move, worst move, idle drag USD, suggested next move. One-line timestamp ("as of 8pm").
- mobile: same Daily Stats card on the Home tab. One Expo push at the user's local 8pm — "Your Homie daily report is ready" — deep-linking to the Home tab. Expo push infrastructure already exists; the nightly job and card are what remain.
- server: add `daily_stats` table to `database.ts` — `wallet, date, pnl_usd, best_move_json, worst_move_json, idle_drag_usd, suggestion_json`. `GET /api/home/daily-stats/:wallet` aggregates the existing `activity_log`, position deltas, idle balance, Kamino health changes, and sentiment data. Nightly job at 20:00 wallet-local iterates all wallets with open positions, computes and writes stats, fires Expo push.

---

## **Day 7 — Set-and-forget Playbooks (PAIR)**

Theme: pre-authorised, scoped automation. Two starter templates wired end-to-end. Move-to-safety on Kamino, DCA via Jupiter Recurring.

Features:

- web: playbook proposal modal that reads like a contract — asset, max size, condition, cooldown, expiry — plain English throughout. Automations tab listing active playbooks with pause and cancel — template name, scope summary, last-fired, next eligible. `/playbooks` explainer page covering scoped, time-bound, auditable, revocable.
- mobile: same playbook proposal modal as a bottom sheet — `PlaybookCard.js` exists for display, build the create and edit sheet on top. Same Automations tab with active playbooks list and pause/cancel.
- server: `playbookStore.ts` CRUD and REST endpoints already exist — verify the fire engine respects cooldowns and expiry on every trigger. Wire move-to-safety template: trigger on Kamino health < 1.15 → repay borrow → swap collateral to USDC (reuses existing `transactionBuilder.ts` tools). Wire DCA template to Jupiter Recurring API via `POST /api/v2/recurring/orders`. On fire: write receipt with Solscan link to `activity_log`, push Expo and Web Push.
- pair: authorise both templates on mainnet from both surfaces. Force-fire move-to-safety on a forked-mainnet 25 percent SOL drop. Capture clip.

---

## **Day 8 — Polish + demo + submission (PAIR)**

Theme: lock the build. Ship the video. File the submissions.

Features:

- web: final landing pass. `/risk` and `/automations` explainer pages live. Demo video embedded. DX report at `/dx-report` — over 2,500 words including a 600-word rebuild essay and an AI-stack section. Frontier Kamino integration page.
- mobile: TestFlight build link and APK link. Final mainnet smoke covering Practice toggle, persona onboarding, idle suggestion, Multiply open, SL attach, Daily Stats render, playbook fire. Learn mode regression check — still launches, lessons complete, XP saves.
- server: backoff and jitter on Jupiter 429s in `fetchRates.ts` and all transaction builders. Refresh Kamino reserves before every multiply close. Audit log export endpoint with request IDs. Feature flags for every shipped flow.
- both: submit Frontier on Superteam Earn under the Kamino track (web URL is the live app). Submit Jupiter Developer Platform with the DX report. Pin demo video on the landing page. Done before evening.

---

## **Day 9+ Buffer decision gate**

After Day 8 evening, decide what the buffer carries:

1. iOS App Store TestFlight expansion. Android Play internal track.
2. Bug-fix and polish only. No new features.
3. Promote Learn mode to a fifth mobile tab — the full Duolingo lesson system (lessons, token education cards, XP, streaks) is already built and sitting behind the `ModePickerSheet`. Buffer is what surfaces it.

---

## **Cut list (drop in this order if behind)**

1. Day 6 Daily Stats push notification (in-app card only).
2. Day 4 Web Push (in-app banner instead).
3. Founder LinkedIn posts.
4. The second blog of any flagship day.
5. Day 7 DCA template (move-to-safety only).
6. Day 5 multi-step plan rollback metadata (best-effort retry only).

**Never cut:** Day 1 four-tab shell, Day 2 persona + idle nudge, Day 3 Practice Wallet, Day 4 SL/TP, Day 5 Multiply, Day 7 playbooks, Day 8 demo cut, DX report.

---

## **Vision check before any push**

1. Which of the four tabs does this strengthen? (Home, Positions, Automations, Chat)
2. Which principle does it serve? (Learn, Practice, Invest)
3. Does it work in Practice mode with zero branching?
4. Does it pass the production-grade checklist in `ROADMAP.md` section 10?

Two or more "not sure" answers, push it back to draft.

---

## **The two rules**

1. The roadmap is the contract. If it is not on this page, it is not shipping. Goes to BACKLOG.
2. No silent days. Each role appends to the DX report at end of day.
