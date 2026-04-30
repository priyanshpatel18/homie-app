import { Router, type Request, type Response } from "express";
const { fetchLiveRates } = require("../data/fetchRates") as {
  fetchLiveRates: () => Promise<unknown>;
};

export const ratesRouter: Router = Router();

ratesRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const rates = await fetchLiveRates();
    res.json(rates);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Rates error:", msg);
    res.status(500).json({ error: msg });
  }
});
