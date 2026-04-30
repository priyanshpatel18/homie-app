// @ts-nocheck
/**
 * positionMonitor.js — background loop that watches registered positions
 * and fires push notifications when risk thresholds are crossed.
 *
 * Checks every INTERVAL_MS (default 15 min):
 *   1. SOL drop  — if SOL fell >SOL_DROP_PCT% from entry → IL/value loss alert
 *   2. Risk drop — if pool risk score fell >RISK_DROP_PTS from entry → review alert
 *   3. Scam      — if pool now shows scam signals → urgent exit alert
 *
 * Call startMonitor() once at server startup.
 */

const { getAllActivePositions, canAlert, markAlerted } = require("./positionStore");
const { getAllActive, getTargets }                     = require("./autopilotStore");
const { sendPushNotification }                         = require("../push/pushService");
const { fetchLiveRates }                               = require("../data/fetchRates");
const { fetchAllPools, analyseAllPools }               = require("../engine/risk");
const { buildFallbackPools }                           = require("../engine/risk/strategyEngine");
const { fetchPortfolio }                               = require("../data/fetchPortfolio");
// sUSDe + USDY rates come from fetchLiveRates (susde_apy, usdy_apy fields)

const INTERVAL_MS          = 15 * 60 * 1000; // 15 min — regular positions
const LEVERAGE_INTERVAL_MS =  2 * 60 * 1000; // 2 min  — leverage positions only
const SOL_DROP_PCT         = 15;             // alert if SOL drops >15% from entry
const RISK_DROP_PTS        = 20;             // alert if risk score drops >20 points
const LIQ_LTV_THRESHOLD    = 0.82;          // Kamino liquidation LTV for most assets
const LIQ_WARN_HEALTH      = 1.15;          // warn when health ratio drops below this
const LIQ_CRIT_HEALTH      = 1.05;          // critical — imminent liquidation
const APY_DROP_REL_PCT     = 35;            // alert if staking/stablecoin APY drops >35% relative
const STAKING_BETTER_PCT   = 0.8;           // alert if another staking option is >0.8% better

// ─── Single check cycle ───────────────────────────────────────────────────────

async function runCheck() {
  // Run autopilot drift checks in parallel with position alerts
  runDriftChecks().catch((err) => console.warn("[Monitor] Drift loop error:", err.message));

  const positions = getAllActivePositions();
  if (positions.length === 0) return;

  console.log(`[Monitor] Checking ${positions.length} active position(s)...`);

  // Fetch current SOL price + pool analyses in parallel
  let solPrice = 0;
  let poolMap  = {};  // pair.toLowerCase() → analysis
  let rates    = null;

  try {
    let livePools;
    [rates, livePools] = await Promise.all([
      fetchLiveRates(),
      fetchAllPools(),
    ]);

    solPrice = rates?.sol_price_usd ?? 0;

    const pools    = livePools.length > 0 ? livePools : buildFallbackPools(rates);
    const analyses = analyseAllPools(pools);

    for (const a of analyses) {
      const key = (a.pool.pair || "").toLowerCase();
      poolMap[key] = a;
    }
  } catch (err) {
    console.warn("[Monitor] Data fetch failed:", err.message);
    return;
  }

  // ── Check each position ────────────────────────────────────────────────────
  for (const pos of positions) {
    try {
      await checkPosition(pos, solPrice, poolMap, rates);
    } catch (err) {
      console.warn(`[Monitor] Error checking ${pos.id}:`, err.message);
    }
  }
}

/**
 * Estimate health ratio for a leverage position based on current vs entry SOL price.
 *
 * For correlated pairs (mSOL×SOL, JitoSOL×SOL) — both assets move together,
 * health stays stable regardless of SOL price. Returns null (no alert needed).
 *
 * For uncorrelated pairs (SOL×USDC, SOL×USDT) — collateral drops with SOL,
 * debt stays fixed → health ratio shrinks as SOL falls.
 *
 * Formula: health = (leverage × ltvThreshold / (leverage - 1)) × (currentSol / entrySol)
 */
function estimateLeverageHealth(leverageData, currentSolPrice, entrySolPrice) {
  if (!leverageData || entrySolPrice <= 0 || currentSolPrice <= 0) return null;

  const { collToken = "", debtToken = "", targetLeverage = 2 } = leverageData;
  const lev = Number(targetLeverage);
  if (lev <= 1) return null;

  // Correlated pairs: both sides track SOL → health stays stable
  const CORRELATED = ["msol", "jitosol", "bsol", "jitoSol", "mSOL", "JitoSOL"];
  const isCorrelated = CORRELATED.some((t) =>
    collToken.toLowerCase().includes(t.toLowerCase())
  );
  if (isCorrelated) return null;

  // Uncorrelated (SOL collateral × USDC/USDT debt)
  const entryHealth  = (lev * LIQ_LTV_THRESHOLD) / (lev - 1);
  const currentHealth = entryHealth * (currentSolPrice / entrySolPrice);
  return currentHealth;
}

async function checkPosition(pos, solPrice, poolMap, rates = null) {
  const { walletAddress, protocol, pair, action, entrySolPrice, entryRiskScore } = pos;

  // ── 1. SOL drop alert ──────────────────────────────────────────────────────
  if (entrySolPrice > 0 && solPrice > 0) {
    const dropPct = ((entrySolPrice - solPrice) / entrySolPrice) * 100;

    if (dropPct >= SOL_DROP_PCT && canAlert(pos, "sol_drop")) {
      const isLp   = action === "lp";
      const title  = isLp
        ? `⚠️ IL Risk — ${pair}`
        : `📉 SOL Down ${dropPct.toFixed(0)}% — ${pair}`;
      const body   = isLp
        ? `SOL dropped ${dropPct.toFixed(1)}% since you entered. Your ${protocol} LP position may have impermanent loss. Tap to review.`
        : `SOL is down ${dropPct.toFixed(1)}% from your entry ($${entrySolPrice.toFixed(0)} → $${solPrice.toFixed(0)}). Your ${protocol} position lost value.`;

      await sendPushNotification(walletAddress, title, body, {
        type:       "position_alert",
        alertType:  "sol_drop",
        positionId: pos.id,
        protocol,
        pair,
        action,
        dropPct:    dropPct.toFixed(1),
      });

      markAlerted(pos, "sol_drop");
      console.log(`[Monitor] sol_drop alert sent for ${pos.id} (${dropPct.toFixed(1)}% drop)`);
    }
  }

  // ── 2. Risk score drop alert ──────────────────────────────────────────────
  if (entryRiskScore > 0) {
    const key      = pair.toLowerCase();
    const analysis = poolMap[key];
    const current  = analysis?.score ?? null;

    if (current !== null) {
      const scoreDrop = entryRiskScore - current;

      if (scoreDrop >= RISK_DROP_PTS && canAlert(pos, "risk_drop")) {
        const title = `🔴 Risk Change — ${pair}`;
        const body  = `${protocol} ${pair} risk score dropped from ${entryRiskScore} to ${current}/100. Review your position.`;

        await sendPushNotification(walletAddress, title, body, {
          type:       "position_alert",
          alertType:  "risk_drop",
          positionId: pos.id,
          protocol,
          pair,
          action,
          entryScore: entryRiskScore,
          current,
        });

        markAlerted(pos, "risk_drop");
        console.log(`[Monitor] risk_drop alert sent for ${pos.id} (${entryRiskScore} → ${current})`);
      }

      // ── 3. Scam alert (overrides cooldown — always urgent) ──────────────
      if (analysis?.scam?.isScam && canAlert(pos, "scam")) {
        const title = `🚨 URGENT — ${pair}`;
        const body  = `Scam/rug signals detected on ${protocol} ${pair}. Consider exiting immediately to protect your funds.`;

        await sendPushNotification(walletAddress, title, body, {
          type:       "position_alert",
          alertType:  "scam",
          positionId: pos.id,
          protocol, pair, action,
          scamReasons: analysis.scam.scamReasons?.slice(0, 2),
        });

        markAlerted(pos, "scam");
        console.log(`[Monitor] SCAM alert sent for ${pos.id}`);
      }
    }
  }

  // ── 4. LP in-range check ──────────────────────────────────────────────────
  if (action === "lp" && pos.rangeLow != null && pos.rangeHigh != null && solPrice > 0) {
    const inRange = solPrice >= pos.rangeLow && solPrice <= pos.rangeHigh;
    if (!inRange && canAlert(pos, "out_of_range")) {
      const dir    = solPrice < pos.rangeLow ? "below" : "above";
      const title  = `📊 LP Out of Range — ${pair}`;
      const body   = `Your ${protocol} ${pair} position is out of range — SOL is $${solPrice.toFixed(0)}, your range is $${pos.rangeLow}–$${pos.rangeHigh}. You're earning 0 fees. Tap to rebalance.`;
      await sendPushNotification(walletAddress, title, body, {
        type: "lp_alert", alertType: "out_of_range", positionId: pos.id,
        protocol, pair, solPrice, rangeLow: pos.rangeLow, rangeHigh: pos.rangeHigh, dir,
      });
      markAlerted(pos, "out_of_range");
      console.log(`[Monitor] out_of_range alert for ${pos.id} (SOL $${solPrice} ${dir} [$${pos.rangeLow}–$${pos.rangeHigh}])`);
    }
  }

  // ── 5. Staking APY drop / better option alert ─────────────────────────────
  if (action === "stake" && pos.entryApy != null && rates) {
    const apyOptions = {
      marinade: rates.marinade_apy,
      jito:     rates.jitosol_apy,
      sanctum:  rates.sanctum_inf_apy,
    };
    const best      = Math.max(...Object.values(apyOptions).filter(Boolean));
    const bestName  = Object.entries(apyOptions).find(([, v]) => v === best)?.[0];

    // Alert if current protocol APY dropped >35% relative from entry
    const currentProtocolKey = protocol.toLowerCase().includes("marinade") ? "marinade"
      : protocol.toLowerCase().includes("jito") ? "jito" : "sanctum";
    const currentApy = apyOptions[currentProtocolKey];
    if (currentApy != null && pos.entryApy > 0) {
      const relativeDrop = ((pos.entryApy - currentApy) / pos.entryApy) * 100;
      if (relativeDrop >= APY_DROP_REL_PCT && canAlert(pos, "apy_drop")) {
        const title = `📉 Staking APY Dropped — ${protocol}`;
        const body  = `${protocol} APY dropped from ${pos.entryApy.toFixed(1)}% to ${currentApy.toFixed(1)}%. ${bestName ? `${bestName} is now offering ${best.toFixed(1)}%.` : ""} Tap to review.`;
        await sendPushNotification(walletAddress, title, body, {
          type: "staking_alert", alertType: "apy_drop", positionId: pos.id,
          protocol, pair, entryApy: pos.entryApy, currentApy, bestApy: best, bestProtocol: bestName,
        });
        markAlerted(pos, "apy_drop");
        console.log(`[Monitor] staking apy_drop for ${pos.id} (${pos.entryApy}% → ${currentApy}%)`);
      }
    }

    // Alert if a significantly better staking option now exists
    if (currentApy != null && best - currentApy >= STAKING_BETTER_PCT && canAlert(pos, "apy_drop")) {
      const title = `💡 Better Staking Available`;
      const body  = `You're staking with ${protocol} at ${currentApy.toFixed(1)}% APY. ${bestName} is now at ${best.toFixed(1)}% — ${(best - currentApy).toFixed(1)}% better. Tap to compare.`;
      await sendPushNotification(walletAddress, title, body, {
        type: "staking_alert", alertType: "better_option", positionId: pos.id,
        protocol, pair, currentApy, bestApy: best, bestProtocol: bestName,
      });
      markAlerted(pos, "apy_drop");
      console.log(`[Monitor] better staking alert for ${pos.id} (${currentApy}% vs ${best}% ${bestName})`);
    }
  }

  // ── 6. Stablecoin APY drop alert (sUSDe) ──────────────────────────────────
  if (action === "stablecoin" && protocol.toLowerCase().includes("ethena") && rates) {
    const susdApy  = rates.susde_apy;
    const usdyApy  = rates.usdy_apy;
    if (susdApy != null && pos.entryApy != null && pos.entryApy > 0) {
      const relativeDrop = ((pos.entryApy - susdApy) / pos.entryApy) * 100;
      if (relativeDrop >= APY_DROP_REL_PCT && canAlert(pos, "apy_drop")) {
        const title = `📉 sUSDe APY Dropped`;
        const body  = `sUSDe APY dropped from ${pos.entryApy.toFixed(1)}% to ${susdApy.toFixed(1)}% — funding rates compressed.${usdyApy != null ? ` USDY is offering ${usdyApy.toFixed(1)}% (T-bills, lower risk).` : ""} Tap to review.`;
        await sendPushNotification(walletAddress, title, body, {
          type: "stablecoin_alert", alertType: "apy_drop", positionId: pos.id,
          protocol: "Ethena", pair: "sUSDe", entryApy: pos.entryApy, currentApy: susdApy, usdyApy,
        });
        markAlerted(pos, "apy_drop");
        console.log(`[Monitor] sUSDe apy_drop for ${pos.id} (${pos.entryApy}% → ${susdApy}%)`);
      }
    }
  }

  // ── 7. Liquidation health check (leverage positions only) ─────────────────
  if (action === "leverage" && pos.leverageData) {
    const health = estimateLeverageHealth(pos.leverageData, solPrice, entrySolPrice);

    if (health !== null) {
      const { collToken = "SOL", debtToken = "USDC", targetLeverage = 2 } = pos.leverageData;
      const label = `${targetLeverage}× ${collToken}×${debtToken}`;

      if (health < LIQ_CRIT_HEALTH && canAlert(pos, "liq_critical")) {
        const title = `🚨 LIQUIDATION IMMINENT — ${label}`;
        const body  = `Your Kamino ${label} leverage position health is ${health.toFixed(2)} — liquidation threshold is 1.0. Exit NOW to recover your funds.`;

        await sendPushNotification(walletAddress, title, body, {
          type:      "liq_alert",
          alertType: "liq_critical",
          positionId: pos.id,
          protocol, pair,
          health: health.toFixed(2),
          collToken, debtToken, targetLeverage,
        });

        markAlerted(pos, "liq_critical");
        console.log(`[Monitor] liq_critical alert for ${pos.id} (health ${health.toFixed(2)})`);

      } else if (health < LIQ_WARN_HEALTH && canAlert(pos, "liq_warning")) {
        const title = `⚠️ Leverage Health Warning — ${label}`;
        const body  = `Your ${label} position health ratio is ${health.toFixed(2)} (warn threshold: ${LIQ_WARN_HEALTH}). SOL dropped from $${entrySolPrice.toFixed(0)} to $${solPrice.toFixed(0)}. Consider adding collateral or reducing leverage.`;

        await sendPushNotification(walletAddress, title, body, {
          type:      "liq_alert",
          alertType: "liq_warning",
          positionId: pos.id,
          protocol, pair,
          health: health.toFixed(2),
          collToken, debtToken, targetLeverage,
        });

        markAlerted(pos, "liq_warning");
        console.log(`[Monitor] liq_warning alert for ${pos.id} (health ${health.toFixed(2)})`);
      }
    }
  }
}

// ─── Autopilot drift check ────────────────────────────────────────────────────

// Cooldown between drift alerts per wallet (4 hours)
const DRIFT_ALERT_COOLDOWN = 4 * 60 * 60 * 1000;
const driftAlertedAt = new Map(); // walletAddress → timestamp

function canDriftAlert(walletAddress) {
  const last = driftAlertedAt.get(walletAddress);
  return !last || Date.now() - last > DRIFT_ALERT_COOLDOWN;
}

function computeAllocation(portfolio) {
  const solBalance = portfolio.solBalance ?? 0;
  const tokens     = portfolio.tokens ?? [];

  const stakedSol  = tokens.find((t) => t.symbol === "mSOL")?.balance ?? 0;
  const stakedUsd  = stakedSol * 1; // rough — server doesn't have prices here, use counts
  const lendingUsd = tokens.filter((t) => t.symbol?.startsWith("k") && t.symbol !== "kSOL")
    .reduce((s, t) => s + (t.usdValue ?? 0), 0);
  const liquidUsd  = tokens
    .filter((t) => t.symbol !== "mSOL" && !t.symbol?.startsWith("k"))
    .reduce((s, t) => s + (t.usdValue ?? 0), 0) + solBalance;

  const total = stakedUsd + lendingUsd + liquidUsd;
  if (total <= 0) return { liquid: 100, staked: 0, lending: 0 };
  return {
    liquid:  Math.round((liquidUsd  / total) * 100),
    staked:  Math.round((stakedUsd  / total) * 100),
    lending: Math.round((lendingUsd / total) * 100),
  };
}

async function runDriftChecks() {
  const configs = getAllActive();
  if (configs.length === 0) return;

  console.log(`[Monitor] Drift-checking ${configs.length} autopilot config(s)...`);

  for (const config of configs) {
    const { walletAddress, strategyId, driftThreshold = 10 } = config;
    if (!canDriftAlert(walletAddress)) continue;

    try {
      const portfolio = await fetchPortfolio(walletAddress, "mainnet");
      const current   = computeAllocation(portfolio);
      const targets   = getTargets(strategyId);

      const maxDrift = Math.max(
        Math.abs(current.liquid  - targets.liquid),
        Math.abs(current.staked  - targets.staked),
        Math.abs(current.lending - targets.lending),
      );

      if (maxDrift >= driftThreshold) {
        const offBucket = ["liquid", "staked", "lending"].find(
          (b) => Math.abs(current[b] - targets[b]) === maxDrift
        );

        const title = `📊 Autopilot: Portfolio Drifted`;
        const body  = `Your ${offBucket} allocation is ${current[offBucket]}% (target: ${targets[offBucket]}%). Drift: ${maxDrift}%. Tap to rebalance.`;

        await sendPushNotification(walletAddress, title, body, {
          type:       "autopilot_drift",
          strategyId,
          maxDrift,
          current,
          targets,
        });

        driftAlertedAt.set(walletAddress, Date.now());
        console.log(`[Monitor] Drift alert for ${walletAddress.slice(0, 8)}... (${maxDrift}% drift on ${offBucket})`);
      }
    } catch (err) {
      console.warn(`[Monitor] Drift check failed for ${walletAddress.slice(0, 8)}...:`, err.message);
    }
  }
}

// ─── Fast cycle: leverage positions only ────────────────────────────────────

async function runLeverageCheck() {
  const positions = getAllActivePositions().filter((p) => p.action === "leverage");
  if (positions.length === 0) return;

  let solPrice = 0;
  try {
    const rates = await fetchLiveRates();
    solPrice = rates?.sol_price_usd ?? 0;
  } catch {
    return;
  }

  for (const pos of positions) {
    try {
      if (pos.leverageData) {
        const health = estimateLeverageHealth(pos.leverageData, solPrice, pos.entrySolPrice);
        if (health !== null) {
          const { collToken = "SOL", debtToken = "USDC", targetLeverage = 2 } = pos.leverageData;
          const label = `${targetLeverage}× ${collToken}×${debtToken}`;

          if (health < LIQ_CRIT_HEALTH && canAlert(pos, "liq_critical")) {
            const title = `🚨 LIQUIDATION IMMINENT — ${label}`;
            const body  = `Health ratio ${health.toFixed(2)} — liquidation at 1.0. Exit NOW.`;
            await sendPushNotification(pos.walletAddress, title, body, {
              type: "liq_alert", alertType: "liq_critical", positionId: pos.id,
              protocol: pos.protocol, pair: pos.pair, health: health.toFixed(2),
              collToken, debtToken, targetLeverage,
            });
            markAlerted(pos, "liq_critical");
            console.log(`[Monitor-Fast] liq_critical for ${pos.id} (health ${health.toFixed(2)})`);

          } else if (health < LIQ_WARN_HEALTH && canAlert(pos, "liq_warning")) {
            const title = `⚠️ Leverage Health Warning — ${label}`;
            const body  = `Health ratio ${health.toFixed(2)} — SOL dropped from $${pos.entrySolPrice?.toFixed(0)} to $${solPrice.toFixed(0)}. Consider adding collateral.`;
            await sendPushNotification(pos.walletAddress, title, body, {
              type: "liq_alert", alertType: "liq_warning", positionId: pos.id,
              protocol: pos.protocol, pair: pos.pair, health: health.toFixed(2),
              collToken, debtToken, targetLeverage,
            });
            markAlerted(pos, "liq_warning");
            console.log(`[Monitor-Fast] liq_warning for ${pos.id} (health ${health.toFixed(2)})`);
          }
        }
      }
    } catch (err) {
      console.warn(`[Monitor-Fast] Error on ${pos.id}:`, err.message);
    }
  }
}

// ─── Start / stop ─────────────────────────────────────────────────────────────

let _timer         = null;
let _leverageTimer = null;

function startMonitor() {
  if (_timer) return; // already running

  console.log(`[Monitor] Started — positions every ${INTERVAL_MS / 60_000}min, leverage every ${LEVERAGE_INTERVAL_MS / 60_000}min`);

  // Run once immediately on startup (after a short delay so server is ready)
  setTimeout(runCheck, 10_000);
  setTimeout(runDriftChecks, 15_000);

  _timer         = setInterval(runCheck, INTERVAL_MS);
  _leverageTimer = setInterval(runLeverageCheck, LEVERAGE_INTERVAL_MS);

  // Drift checks on same cadence as regular positions
  setInterval(runDriftChecks, INTERVAL_MS);
}

function stopMonitor() {
  if (_timer)         { clearInterval(_timer);         _timer = null; }
  if (_leverageTimer) { clearInterval(_leverageTimer); _leverageTimer = null; }
  console.log("[Monitor] Stopped");
}

module.exports = { startMonitor, stopMonitor, runCheck };