// @ts-nocheck
const HL_API = "https://api.hyperliquid.xyz/info";

async function hlPost(body) {
  const res = await fetch(HL_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Hyperliquid API ${res.status}`);
  return res.json();
}

// Fetch all perp markets with prices, funding rates, open interest
async function fetchHlMarkets() {
  const [meta, ctxs] = await hlPost({ type: "metaAndAssetCtxs" });
  const assets = meta.universe;

  return assets
    .map((asset, i) => {
      const ctx = ctxs[i] || {};
      const price = parseFloat(ctx.markPx || 0);
      const fundingRate = parseFloat(ctx.funding || 0); // per hour as decimal
      const oi = parseFloat(ctx.openInterest || 0);
      const vol = parseFloat(ctx.dayNtlVlm || 0);

      return {
        symbol:        asset.name,
        maxLeverage:   asset.maxLeverage || 20,
        price,
        fundingRate1h: (fundingRate * 100).toFixed(4) + "%",   // e.g. "0.0102%"
        fundingRateApr: (fundingRate * 24 * 365 * 100).toFixed(1) + "%", // annualised
        fundingBias:   fundingRate > 0 ? "longs pay shorts" : "shorts pay longs",
        openInterestUsd: oi * price,
        volume24hUsd:  vol,
      };
    })
    .filter((m) => m.price > 0);
}

// Get a single asset by symbol
async function fetchHlAsset(symbol) {
  const markets = await fetchHlMarkets();
  return markets.find((m) => m.symbol.toUpperCase() === symbol.toUpperCase()) || null;
}

// Top markets by 24h volume
async function fetchHlTopMarkets(limit = 15) {
  const markets = await fetchHlMarkets();
  return markets
    .sort((a, b) => b.volume24hUsd - a.volume24hUsd)
    .slice(0, limit)
    .map((m) => ({
      symbol:        m.symbol,
      price:         m.price,
      funding1h:     m.fundingRate1h,
      fundingApr:    m.fundingRateApr,
      bias:          m.fundingBias,
      maxLeverage:   m.maxLeverage,
      volume24hUsd:  m.volume24hUsd,
      oiUsd:         m.openInterestUsd,
    }));
}

export { fetchHlMarkets, fetchHlAsset, fetchHlTopMarkets };