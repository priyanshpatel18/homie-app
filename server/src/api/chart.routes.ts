import { Router, type Request, type Response } from "express";
const { fetchTokenChart } = require("../data/fetchTokenChart") as {
  fetchTokenChart: (token: string, range: string) => Promise<unknown>;
};

export const chartRouter: Router = Router();

const VALID_RANGES = ["1H", "24H", "7D", "30D", "1Y"] as const;
type ChartRange = (typeof VALID_RANGES)[number];

chartRouter.get("/:token/:range", async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token ?? "");
    const range = String(req.params.range ?? "");
    if (!VALID_RANGES.includes(range as ChartRange)) {
      return res.status(400).json({ error: "Invalid range" });
    }
    const data = await fetchTokenChart(token, range);
    if (!data) return res.status(404).json({ error: `No data found for ${token}` });
    res.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});
