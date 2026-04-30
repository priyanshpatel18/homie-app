/**
 * Kamino CASH Vault data fetcher.
 * CASH is Kamino's delta-neutral yield vault designed with Gauntlet.
 * It accepts stablecoins and generates yield while minimizing price exposure.
 */

const VAULTS_API  = "https://api.kamino.finance/kvaults/vaults";
const METRICS_API = "https://api.kamino.finance/kvaults/vaults/metrics";

// Known CASH vault addresses on mainnet (fallback identifiers)
const CASH_VAULT_KEYWORDS = ["cash"];

let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 min

function normApy(raw) {
  if (raw == null) return null;
  const n = parseFloat(raw);
  if (isNaN(n)) return null;
  return parseFloat((n < 1 ? n * 100 : n).toFixed(2));
}

function isCashVault(v) {
  const name  = (v?.name          ?? "").toLowerCase();
  const token = (v?.token_symbol  ?? v?.symbol ?? "").toLowerCase();
  const strat = (v?.strategy_type ?? v?.strategyType ?? "").toLowerCase();
  return (
    CASH_VAULT_KEYWORDS.some((k) => name.includes(k)) ||
    CASH_VAULT_KEYWORDS.some((k) => token.includes(k)) ||
    strat.includes("delta")
  );
}

async function fetchCashVaults() {
  if (_cache && Date.now() - _cacheTime < CACHE_TTL) return _cache;

  // Fetch vaults list and metrics in parallel
  const [vaultsRes, metricsRes] = await Promise.allSettled([
    fetch(VAULTS_API,  { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) }),
    fetch(METRICS_API, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) }),
  ]);

  let vaults  = [];
  let metrics = {};

  if (vaultsRes.status === "fulfilled" && vaultsRes.value.ok) {
    const raw = await vaultsRes.value.json() as any;
    vaults = Array.isArray(raw) ? raw : raw?.data ?? raw?.vaults ?? [];
  }

  if (metricsRes.status === "fulfilled" && metricsRes.value.ok) {
    const raw = await metricsRes.value.json() as any;
    // Build a lookup by vault address
    const list = Array.isArray(raw) ? raw : raw?.data ?? [];
    for (const m of list) {
      const addr = m?.vault_address ?? m?.pubkey ?? m?.address;
      if (addr) metrics[addr] = m;
    }
  }

  // Match CASH vaults
  const cashVaults = vaults.filter(isCashVault);

  const result = cashVaults.map((v) => {
    const addr  = v?.vault_address ?? v?.pubkey ?? v?.address ?? null;
    const extra = addr ? (metrics[addr] ?? {}) : {};

    // APY — try multiple field names across Kamino's API versions
    const apyRaw =
      v?.apy ?? v?.total_apy ?? v?.metrics?.apy ??
      extra?.apy ?? extra?.total_apy ?? null;

    // TVL
    const tvlRaw =
      v?.tvl ?? v?.total_value_locked ?? v?.metrics?.tvl ??
      extra?.tvl ?? extra?.total_value_locked ?? 0;

    // Token info
    const tokenSymbol  = v?.token_symbol ?? v?.symbol ?? v?.token ?? "USDC";
    const tokenMint    = v?.token_mint   ?? v?.mint   ?? null;
    const acceptedTokens = v?.accepted_tokens ?? [tokenSymbol];

    return {
      name:            v?.name ?? "Kamino CASH",
      vaultAddress:    addr,
      tokenSymbol:     tokenSymbol.toUpperCase(),
      tokenMint,
      acceptedTokens,
      apy:             normApy(apyRaw),
      tvlUsd:          parseFloat(tvlRaw) || 0,
      strategyType:    v?.strategy_type ?? v?.strategyType ?? "delta-neutral",
      riskLevel:       "low",
      description:     "Delta-neutral yield strategy co-designed with Gauntlet. Earns yield on stablecoins without directional price exposure.",
      link:            "https://app.kamino.finance/liquidity/earn",
      updatedAt:       new Date().toISOString(),
    };
  });

  // If no CASH vault found via API, return well-known fallback metadata
  if (result.length === 0) {
    result.push({
      name:          "Kamino CASH",
      vaultAddress:  null,
      tokenSymbol:   "USDC",
      tokenMint:     "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      acceptedTokens: ["USDC"],
      apy:           null,
      tvlUsd:        0,
      strategyType:  "delta-neutral",
      riskLevel:     "low",
      description:   "Delta-neutral yield strategy co-designed with Gauntlet. Earns yield on stablecoins without directional price exposure.",
      link:          "https://app.kamino.finance/liquidity/earn",
      updatedAt:     new Date().toISOString(),
    });
  }

  _cache     = result;
  _cacheTime = Date.now();
  return result;
}

// Return the primary CASH vault (highest TVL if multiple)
async function fetchPrimaryCashVault() {
  const vaults = await fetchCashVaults();
  return vaults.sort((a, b) => b.tvlUsd - a.tvlUsd)[0] ?? null;
}

export { fetchCashVaults, fetchPrimaryCashVault };