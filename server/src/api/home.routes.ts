import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/auth";
import { requireWalletOwnership } from "../middleware/walletOwnership";

const { fetchPortfolio } = require("../data/fetchPortfolio") as {
  fetchPortfolio: (
    wallet: string,
    network?: string
  ) => Promise<{
    solBalance: number;
    tokens: Array<{ usdValue: number | null }>;
    positions: unknown[];
  }>;
};

const { fetchMarketContext } = require("../data/fetchMarket") as {
  fetchMarketContext: () => Promise<{ sol?: { usd: number } | null } | null>;
};

export const homeRouter: Router = Router();

homeRouter.get(
  "/snapshot/:walletAddress",
  requireAuth,
  requireWalletOwnership,
  async (req: Request, res: Response) => {
    const walletAddress = String(req.params.walletAddress ?? "");
    if (!walletAddress) {
      return res.status(400).json({ error: "walletAddress required" });
    }

    const network =
      typeof req.query.network === "string" ? req.query.network : "mainnet";

    try {
      const [portfolio, market] = await Promise.all([
        fetchPortfolio(walletAddress, network),
        fetchMarketContext().catch(() => null),
      ]);

      const solBalance = portfolio?.solBalance ?? 0;
      const solPrice = market?.sol?.usd ?? 0;
      const tokensUsd = (portfolio?.tokens ?? []).reduce(
        (sum, t) => sum + (t.usdValue ?? 0),
        0
      );

      const idleBalanceUsd =
        Math.round((solBalance * solPrice + tokensUsd) * 100) / 100;
      const positionCount = portfolio?.positions?.length ?? 0;

      res.json({
        idleBalanceUsd,
        positionCount,
        dailyStatStub: null,
        topSuggestionStub: null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Home snapshot error:", msg);
      res.status(500).json({ error: msg });
    }
  }
);
