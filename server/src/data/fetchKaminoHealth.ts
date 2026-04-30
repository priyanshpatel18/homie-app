/**
 * Fetch a user's Kamino lending obligations — deposits, borrows, health factor,
 * and estimated liquidation price.
 * Uses Kamino REST: api.kamino.finance/v2/users/{wallet}/obligations
 */

async function fetchKaminoObligations(walletAddress) {
  const res = await fetch(
    `https://api.kamino.finance/v2/users/${walletAddress}/obligations`,
    { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) }
  );
  if (!res.ok) throw new Error(`Kamino obligations API ${res.status}`);
  const data = await res.json() as any;

  const raw = data?.obligations ?? data?.data ?? (Array.isArray(data) ? data : []);

  return raw
    .map((obl) => {
      const stats = obl.refreshedStats ?? obl.stats ?? {};

      const deposits = (obl.deposits ?? obl.userDeposits ?? []).map((d) => ({
        token:    (d.tokenSymbol ?? d.symbol ?? d.token ?? "?").toUpperCase(),
        amount:   +parseFloat(d.amount ?? d.depositedAmount ?? 0).toFixed(6),
        usdValue: +parseFloat(d.marketValueRefreshed ?? d.usdValue ?? 0).toFixed(2),
      }));

      const borrows = (obl.borrows ?? obl.userBorrows ?? []).map((b) => ({
        token:    (b.tokenSymbol ?? b.symbol ?? b.token ?? "?").toUpperCase(),
        amount:   +parseFloat(b.amount ?? b.borrowedAmount ?? 0).toFixed(6),
        usdValue: +parseFloat(b.marketValueRefreshed ?? b.usdValue ?? 0).toFixed(2),
      }));

      const totalCollUsd  = +(stats.userTotalDeposit ?? deposits.reduce((s, d) => s + d.usdValue, 0)).toFixed(2);
      const totalDebtUsd  = +(stats.userTotalBorrow  ?? borrows.reduce((s, b) => s + b.usdValue, 0)).toFixed(2);
      const liqLtv        = stats.liquidationLtv ?? 0.75;
      const healthFactor  = stats.healthFactor != null
        ? +parseFloat(stats.healthFactor).toFixed(3)
        : totalDebtUsd > 0 ? +(totalCollUsd / totalDebtUsd).toFixed(3) : null;

      // Estimate liq price for SOL-collateral positions
      let liquidationPriceSol = null;
      const solDep = deposits.find((d) => d.token === "SOL");
      if (solDep && solDep.amount > 0 && totalDebtUsd > 0) {
        liquidationPriceSol = +(totalDebtUsd / (liqLtv * solDep.amount)).toFixed(2);
      }

      const riskLevel =
        healthFactor == null     ? "no_borrow"
        : healthFactor < 1.05   ? "critical"
        : healthFactor < 1.3    ? "high"
        : healthFactor < 1.8    ? "medium"
        : "safe";

      return {
        market:             obl.lendingMarket ?? obl.market ?? "Kamino Main",
        totalCollateralUsd: totalCollUsd,
        totalDebtUsd,
        netValueUsd:        +(totalCollUsd - totalDebtUsd).toFixed(2),
        healthFactor,
        liquidationPriceSol,
        riskLevel,
        deposits,
        borrows,
      };
    })
    .filter((o) => o.totalCollateralUsd > 0 || o.totalDebtUsd > 0);
}

export { fetchKaminoObligations };