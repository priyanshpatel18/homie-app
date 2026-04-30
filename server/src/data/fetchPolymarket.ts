// @ts-nocheck
const GAMMA = "https://gamma-api.polymarket.com";

async function gammaGet(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${GAMMA}${path}${qs ? "?" + qs : ""}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Polymarket API ${res.status}`);
  return res.json();
}

function parseMarket(m) {
  let outcomes = [];
  let prices   = [];
  try { outcomes = JSON.parse(m.outcomes  || "[]"); } catch {}
  try { prices   = JSON.parse(m.outcomePrices || "[]").map(Number); } catch {}

  return {
    id:         m.id,
    question:   m.question,
    endDate:    m.endDateIso || m.endDate,
    volume:     parseFloat(m.volume   || 0),
    liquidity:  parseFloat(m.liquidity || 0),
    outcomes,
    prices,            // index matches outcomes: [YES price, NO price] in $
    yesPrice:   prices[0] ?? null,
    noPrice:    prices[1] ?? null,
    slug:       m.slug,
    category:   m.category || null,
    active:     m.active,
    closed:     m.closed,
  };
}

// Search active markets by keyword
async function fetchPmMarkets({ query, limit = 8 } = {}) {
  const params = {
    limit:  String(limit),
    active: "true",
    closed: "false",
    ...(query ? { search: query } : {}),
  };
  const data = await gammaGet("/markets", params);
  return (Array.isArray(data) ? data : []).map(parseMarket);
}

// Find crypto-relevant markets for a given token symbol
async function findCryptoMarkets(symbol, limit = 6) {
  const queries = [symbol, `${symbol} price`, `${symbol} crypto`];
  const seen    = new Set();
  const results = [];

  for (const q of queries) {
    try {
      const markets = await fetchPmMarkets({ query: q, limit: 10 });
      for (const m of markets) {
        if (!seen.has(m.id) && m.liquidity > 500) {
          seen.add(m.id);
          results.push(m);
        }
      }
    } catch {}
    if (results.length >= limit) break;
  }

  return results
    .sort((a, b) => b.liquidity - a.liquidity)
    .slice(0, limit);
}

// Get a specific market by id or slug
async function fetchPmMarket(idOrSlug) {
  try {
    const data = await gammaGet(`/markets/${idOrSlug}`);
    return parseMarket(data);
  } catch {
    // Try slug search
    const results = await fetchPmMarkets({ query: idOrSlug, limit: 1 });
    return results[0] || null;
  }
}

export { fetchPmMarkets, findCryptoMarkets, fetchPmMarket };