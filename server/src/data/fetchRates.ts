// @ts-nocheck
/**
 * Live rate fetcher -- pulls real APYs from Marinade, Kamino, Jito, Sanctum,
 * Jupiter Lend, marginfi, Ethena (sUSDe), and Ondo (USDY).
 * Falls back to static values if any API is down so the app never crashes.
 */

const { fetchJitoData } = require("./fetchJitoData");
const { fetchSanctumData } = require("./fetchSanctumData");
const { fetchJupiterEarnTokens } = require("./fetchJupiterLendData");
const { fetchMarginfiBanks } = require("./fetchMarginfiData");
const { fetchEthenaData } = require("./fetchEthenaData");
const { fetchOndoData }   = require("./fetchOndoData");

const FALLBACKS = {
  marinade_apy: 7.2,
  marinade_native_apy: 6.8,
  kamino_sol_lending_apy: 4.1,
  kamino_usdc_lending_apy: 8.5,
  kamino_sol_usdc_lp_apy: 15.3,
  jitosol_apy: 7.8,
  sanctum_inf_apy: 7.5,
  jup_lend_usdc_apy: 6.0,
  jup_lend_sol_apy: 3.0,
  marginfi_usdc_supply_apy: 8.0,
  marginfi_sol_supply_apy: 3.5,
  // No SOL price fallback — null forces the agent to use get_market_data instead
  sol_price_usd: null,
};

// Cache rates for 5 minutes so we don't hammer the APIs on every request
let cache = null;
let cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchMarinadeApy() {
  const res = await fetch("https://api.marinade.finance/msol/apy/1y", {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Marinade API ${res.status}`);
  const data = await res.json() as any;

  // Response shape: { value: 0.072 } (decimal) or { apy: 7.2 } (percent)
  const raw = data.value ?? data.apy ?? data.total ?? null;
  if (raw === null) throw new Error("Marinade: unexpected response shape");

  // Normalize: if < 1, it's a decimal → convert to percent
  const apy = raw < 1 ? parseFloat((raw * 100).toFixed(2)) : parseFloat(raw.toFixed(2));
  return apy;
}

async function fetchKaminoRates() {
  const [marketRes, vaultRes] = await Promise.all([
    fetch("https://api.kamino.finance/v2/kamino-market", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    }),
    fetch("https://api.kamino.finance/kvaults/vaults", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    }),
  ]);

  const rates = {
    sol_lending_apy: FALLBACKS.kamino_sol_lending_apy,
    usdc_lending_apy: FALLBACKS.kamino_usdc_lending_apy,
    sol_usdc_lp_apy: FALLBACKS.kamino_sol_usdc_lp_apy,
  };

  // Extract lending APYs from market reserves
  if (marketRes.ok) {
    const market = await marketRes.json() as any;
    const reserves = market?.reserves ?? market?.data?.reserves ?? [];

    for (const reserve of reserves) {
      const symbol = (reserve?.symbol ?? reserve?.mint_symbol ?? "").toUpperCase();
      // Supply APY can be nested in different shapes depending on Kamino version
      const supplyApy =
        reserve?.supply_apy ??
        reserve?.supplyApy ??
        reserve?.metrics?.supply_apy ??
        null;

      if (supplyApy === null) continue;
      const pct = supplyApy < 1 ? parseFloat((supplyApy * 100).toFixed(2)) : parseFloat(supplyApy.toFixed(2));

      if (symbol === "SOL") rates.sol_lending_apy = pct;
      if (symbol === "USDC") rates.usdc_lending_apy = pct;
    }
  }

  // Extract LP APY from vaults (find the SOL-USDC vault)
  if (vaultRes.ok) {
    const vaults = await vaultRes.json() as any;
    const vaultList = Array.isArray(vaults) ? vaults : vaults?.data ?? vaults?.vaults ?? [];

    const solUsdcVault = vaultList.find((v) => {
      const name = (v?.name ?? v?.token_a_symbol ?? "").toUpperCase();
      return name.includes("SOL") && (name.includes("USDC") || (v?.token_b_symbol ?? "").toUpperCase().includes("USDC"));
    });

    if (solUsdcVault) {
      const apy = solUsdcVault?.apy ?? solUsdcVault?.total_apy ?? solUsdcVault?.metrics?.apy ?? null;
      if (apy !== null) {
        rates.sol_usdc_lp_apy = apy < 1
          ? parseFloat((apy * 100).toFixed(2))
          : parseFloat(apy.toFixed(2));
      }
    }
  }

  return rates;
}

async function fetchSolPrice() {
  // Jupiter v6 price API (v4 is deprecated)
  // SOL mint: So11111111111111111111111111111111111111112
  const res = await fetch(
    "https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112",
    { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(5000) }
  );
  if (!res.ok) throw new Error(`Jupiter price API ${res.status}`);
  const data = await res.json() as any;
  const price = data?.data?.["So11111111111111111111111111111111111111112"]?.price ?? null;
  if (!price) throw new Error("Jupiter v6: no SOL price in response");
  return parseFloat(parseFloat(price).toFixed(2));
}

async function fetchLiveRates() {
  // Return cache if still fresh
  if (cache && Date.now() - cacheTime < CACHE_TTL_MS) {
    return cache;
  }

  // Fetch all nine in parallel -- each fails independently
  const [marinadeResult, kaminoResult, jupiterResult, jitoResult, sanctumResult, jupLendResult, marginfiResult, ethenaResult, ondoResult] = await Promise.allSettled([
    fetchMarinadeApy(),
    fetchKaminoRates(),
    fetchSolPrice(),
    fetchJitoData(),
    fetchSanctumData(),
    fetchJupiterEarnTokens(),
    fetchMarginfiBanks(),
    fetchEthenaData(),
    fetchOndoData(),
  ]);

  const marinadeApy =
    marinadeResult.status === "fulfilled"
      ? marinadeResult.value
      : (console.warn("Marinade API failed, using fallback:", marinadeResult.reason?.message), FALLBACKS.marinade_apy);

  const kaminoRates =
    kaminoResult.status === "fulfilled"
      ? kaminoResult.value
      : (console.warn("Kamino API failed, using fallback:", kaminoResult.reason?.message), {
          sol_lending_apy: FALLBACKS.kamino_sol_lending_apy,
          usdc_lending_apy: FALLBACKS.kamino_usdc_lending_apy,
          sol_usdc_lp_apy: FALLBACKS.kamino_sol_usdc_lp_apy,
        });

  const solPriceUsd =
    jupiterResult.status === "fulfilled"
      ? jupiterResult.value
      : (console.warn("Jupiter API failed, using fallback:", jupiterResult.reason?.message), FALLBACKS.sol_price_usd);

  const jitoData =
    jitoResult.status === "fulfilled"
      ? jitoResult.value
      : (console.warn("Jito API failed, using fallback:", jitoResult.reason?.message), { jitosol_apy: FALLBACKS.jitosol_apy });

  const sanctumData =
    sanctumResult.status === "fulfilled"
      ? sanctumResult.value
      : (console.warn("Sanctum API failed, using fallback:", sanctumResult.reason?.message), { inf_apy: FALLBACKS.sanctum_inf_apy });

  // Jupiter Lend — extract USDC and SOL rates from earn tokens
  let jupLendUsdcApy = FALLBACKS.jup_lend_usdc_apy;
  let jupLendSolApy  = FALLBACKS.jup_lend_sol_apy;
  if (jupLendResult.status === "fulfilled" && Array.isArray(jupLendResult.value)) {
    const jupTokens = jupLendResult.value;
    const usdcToken = jupTokens.find((t) => t.symbol === "USDC");
    const solToken  = jupTokens.find((t) => t.symbol === "SOL");
    if (usdcToken?.totalApy != null) jupLendUsdcApy = usdcToken.totalApy;
    if (solToken?.totalApy != null)  jupLendSolApy  = solToken.totalApy;
  } else {
    console.warn("Jupiter Lend API failed, using fallback:", jupLendResult.reason?.message);
  }

  // marginfi — extract USDC and SOL supply rates
  let marginfiUsdcApy = FALLBACKS.marginfi_usdc_supply_apy;
  let marginfiSolApy  = FALLBACKS.marginfi_sol_supply_apy;
  if (marginfiResult.status === "fulfilled" && Array.isArray(marginfiResult.value)) {
    const banks = marginfiResult.value;
    const usdcBank = banks.find((b) => b.symbol === "USDC");
    const solBank  = banks.find((b) => b.symbol === "SOL");
    if (usdcBank?.supplyApy != null) marginfiUsdcApy = usdcBank.supplyApy;
    if (solBank?.supplyApy != null)  marginfiSolApy  = solBank.supplyApy;
  } else {
    console.warn("marginfi API failed, using fallback:", marginfiResult.reason?.message);
  }

  cache = {
    marinade_apy: marinadeApy,
    // Native staking is typically ~0.4% below liquid staking
    marinade_native_apy: parseFloat((marinadeApy - 0.4).toFixed(2)),
    kamino_sol_lending_apy: kaminoRates.sol_lending_apy,
    kamino_usdc_lending_apy: kaminoRates.usdc_lending_apy,
    kamino_sol_usdc_lp_apy: kaminoRates.sol_usdc_lp_apy,
    jitosol_apy: jitoData.jitosol_apy ?? FALLBACKS.jitosol_apy,
    sanctum_inf_apy: sanctumData.inf_apy ?? FALLBACKS.sanctum_inf_apy,
    jup_lend_usdc_apy: jupLendUsdcApy,
    jup_lend_sol_apy: jupLendSolApy,
    marginfi_usdc_supply_apy: marginfiUsdcApy,
    marginfi_sol_supply_apy: marginfiSolApy,
    susde_apy: ethenaResult.status === "fulfilled" ? (ethenaResult.value?.apy ?? 15.0) : 15.0,
    usdy_apy: ondoResult.status === "fulfilled" ? (ondoResult.value?.apy ?? 5.0) : 5.0,
    usdy_price: ondoResult.status === "fulfilled" ? (ondoResult.value?.price ?? 1.05) : 1.05,
    sol_price_usd: solPriceUsd,
    fetched_at: new Date().toISOString(),
  };
  cacheTime = Date.now();

  console.log("Live rates fetched:", cache);
  return cache;
}

export { fetchLiveRates };