// @ts-nocheck
const { fetchJupPerpsAsset } = require("../data/fetchJupiterPerps");

function fmt(n, dp = 2) { return Number(n).toFixed(dp); }
function fmtUsd(n) {
  if (Math.abs(n) >= 1e6) return "$" + fmt(n / 1e6, 2) + "M";
  if (Math.abs(n) >= 1e3) return "$" + fmt(n / 1e3, 1) + "K";
  return "$" + fmt(n, 2);
}

// Estimate liquidation price for a position
function estimateLiqPrice(entryPrice, leverage, isLong) {
  // Simplified: liquidation occurs when loss = margin (ignoring fees)
  // Long:  liq = entry * (1 - 1/leverage)
  // Short: liq = entry * (1 + 1/leverage)
  const factor = 1 / leverage;
  return isLong
    ? entryPrice * (1 - factor)
    : entryPrice * (1 + factor);
}

async function buildJupPerpStrategy({ symbol, direction, amountUsd, leverage = 5 }) {
  symbol    = symbol.toUpperCase();
  amountUsd = Number(amountUsd);
  leverage  = Math.min(Math.max(Number(leverage), 1), 100);
  const isLong = direction === "bullish";

  let market;
  try {
    market = await fetchJupPerpsAsset(symbol);
  } catch (e) {
    return { error: e.message };
  }

  if (leverage > market.maxLeverage) leverage = market.maxLeverage;

  const notional       = amountUsd * leverage;
  const entryPrice     = market.price;
  const liqPrice       = estimateLiqPrice(entryPrice, leverage, isLong);
  const borrow1h       = market.funding1hPct / 100; // as decimal
  const borrowCost30d  = amountUsd * borrow1h * 24 * 30;

  // Payoff at ±20% move
  const move20 = notional * 0.20;
  const scenarios = [
    {
      label: isLong ? `${symbol} +20%` : `${symbol} −20%`,
      pnl:   +move20,
      note:  "Favour",
      color: "green",
    },
    {
      label: "Flat (30d hold)",
      pnl:   -borrowCost30d,
      note:  "Borrow cost only",
      color: "yellow",
    },
    {
      label: isLong ? `${symbol} −20%` : `${symbol} +20%`,
      pnl:   -move20,
      note:  "Against",
      color: "red",
    },
  ];

  return {
    exchange: "Jupiter Perps",
    view:     `${isLong ? "Bullish" : "Bearish"} ${symbol}`,
    perpLeg: {
      symbol,
      label:        market.label,
      direction:    isLong ? "LONG" : "SHORT",
      margin:       amountUsd,
      leverage,
      notional,
      entryPrice,
      liqPrice:     parseFloat(liqPrice.toFixed(2)),
      funding1hPct: market.funding1hPct,
      fundingAprPct: market.fundingAprPct,
      borrowCost30d: parseFloat(borrowCost30d.toFixed(2)),
      maxLeverage:  market.maxLeverage,
      tradeUrl:     market.tradeUrl,
    },
    scenarios,
    summary: [
      `${isLong ? "Long" : "Short"} ${symbol} with ${fmtUsd(amountUsd)} margin at ${leverage}× leverage → ${fmtUsd(notional)} notional.`,
      `Entry ~${fmtUsd(entryPrice)}. Estimated liquidation at ${fmtUsd(liqPrice)}.`,
      `30-day borrow cost ~${fmtUsd(borrowCost30d)}.`,
    ].join(" "),
    disclaimer: "For informational purposes only. Perpetuals carry liquidation risk. Borrow rate estimates based on typical Jupiter Perps rates.",
  };
}

module.exports = { buildJupPerpStrategy };