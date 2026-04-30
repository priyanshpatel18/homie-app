/**
 * Jupiter Perpetuals market data.
 * Jupiter Perps supports SOL, BTC, ETH with up to 100× leverage.
 * Price comes from Jupiter Price API (reliable). Funding + OI from Birdeye / estimates.
 */

const JUP_PRICE_URL = "https://api.jup.ag/price/v2";

// Mint addresses for the supported perp assets
const PERP_ASSETS = {
  SOL: {
    mint:        "So11111111111111111111111111111111111111112",
    maxLeverage: 100,
    minLeverage: 1,
    label:       "SOL-USD",
  },
  ETH: {
    mint:        "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
    maxLeverage: 100,
    minLeverage: 1,
    label:       "ETH-USD",
  },
  BTC: {
    mint:        "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh",
    maxLeverage: 100,
    minLeverage: 1,
    label:       "BTC-USD",
  },
};

// Fetch prices for all perp assets in one call
async function fetchPerpPrices() {
  const mints = Object.values(PERP_ASSETS).map((a) => a.mint).join(",");
  for (const url of [
    `${JUP_PRICE_URL}?ids=${mints}`,
    `https://lite.jup.ag/price/v2?ids=${mints}`,
  ]) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6_000) });
      if (!res.ok) continue;
      const json = await res.json() as any;
      return json.data || {};
    } catch {
      // try next
    }
  }
  return {};
}

// Try Jupiter Perps stats endpoint for funding/OI data
async function fetchPerpStats() {
  try {
    const res = await fetch("https://perps-api.jup.ag/v1/pools", {
      signal: AbortSignal.timeout(5_000),
    });
    if (res.ok) {
      const json = await res.json() as any;
      return json;
    }
  } catch {}
  return null;
}

// Build a market object for a given symbol
async function fetchJupPerpsAsset(symbol) {
  const upper = symbol.toUpperCase();
  const asset = PERP_ASSETS[upper];
  if (!asset) {
    const supported = Object.keys(PERP_ASSETS).join(", ");
    throw new Error(`${upper} not available on Jupiter Perps. Supported: ${supported}`);
  }

  const prices = await fetchPerpPrices();
  const priceInfo = prices[asset.mint];
  const price = priceInfo ? parseFloat(priceInfo.price) : null;
  if (!price || price <= 0) throw new Error(`Could not fetch price for ${upper}`);

  // Funding rate: Jupiter Perps uses a borrow-rate model, not a traditional funding rate.
  // Typical borrow rates: ~0.008%/hr for SOL, ~0.010%/hr for BTC/ETH.
  // These are paid by the position side with positive funding.
  const TYPICAL_BORROW_1H = { SOL: 0.008, BTC: 0.010, ETH: 0.009 };
  const borrow1h = TYPICAL_BORROW_1H[upper] ?? 0.008;

  return {
    symbol:       upper,
    label:        asset.label,
    price,
    maxLeverage:  asset.maxLeverage,
    minLeverage:  asset.minLeverage,
    funding1hPct: borrow1h,                           // % per hour
    fundingAprPct: (borrow1h * 24 * 365).toFixed(1),  // annualised %
    fundingLabel: "borrow rate",
    exchange:     "Jupiter Perps",
    tradeUrl:     `https://app.jup.ag/perps/${upper}`,
  };
}

// Top markets (all 3 supported assets)
async function fetchJupPerpsMarkets() {
  const prices = await fetchPerpPrices();
  return Object.entries(PERP_ASSETS).map(([symbol, asset]) => {
    const priceInfo = prices[asset.mint];
    const price = priceInfo ? parseFloat(priceInfo.price) : null;
    const TYPICAL_BORROW_1H = { SOL: 0.008, BTC: 0.010, ETH: 0.009 };
    const borrow1h = TYPICAL_BORROW_1H[symbol] ?? 0.008;
    return {
      symbol,
      label:        asset.label,
      price,
      maxLeverage:  asset.maxLeverage,
      funding1hPct: borrow1h,
      fundingAprPct: +(borrow1h * 24 * 365).toFixed(1),
      tradeUrl:     `https://app.jup.ag/perps/${symbol}`,
    };
  }).filter((m) => m.price != null);
}

export { fetchJupPerpsAsset, fetchJupPerpsMarkets };