import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/auth";
import { requireWalletOwnership } from "../middleware/walletOwnership";
const { fetchPortfolio } = require("../data/fetchPortfolio") as {
  fetchPortfolio: (wallet: string, network?: string) => Promise<unknown>;
};

export const portfolioRouter: Router = Router();

portfolioRouter.get("/:walletAddress", requireAuth, requireWalletOwnership, async (req: Request, res: Response) => {
  try {
    const walletAddress = String(req.params.walletAddress ?? "");
    const network =
      typeof req.query.network === "string" ? req.query.network : "mainnet";
    if (!walletAddress) return res.status(400).json({ error: "walletAddress required" });
    const portfolio = await fetchPortfolio(walletAddress, network);
    res.json(portfolio);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Portfolio error:", msg);
    res.status(500).json({ error: msg });
  }
});
