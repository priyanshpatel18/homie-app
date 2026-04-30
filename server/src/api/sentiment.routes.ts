import { Router, type Request, type Response } from "express";

const { getSentiment } = require("../ai/sentimentEngine") as {
  getSentiment: (token: string, mint: string | null) => Promise<unknown>;
};

export const sentimentRouter: Router = Router();

sentimentRouter.get("/:token", async (req: Request, res: Response) => {
  const token = String(req.params.token ?? "");
  const mintParam = req.query.mint;
  const mint = typeof mintParam === "string" ? mintParam : null;
  if (!token) return res.status(400).json({ error: "token required" });
  try {
    const result = await getSentiment(token.toUpperCase(), mint);
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sentiment] error:", msg);
    res.status(500).json({ error: msg });
  }
});
