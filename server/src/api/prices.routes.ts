import { Router, type Request, type Response } from "express";
import { CG_PRICE_IDS, env } from "../config/env";

export const pricesRouter: Router = Router();

interface PricesRequest extends Request {
  _cgPrices?: Record<string, number>;
}

pricesRouter.get("/", async (req: PricesRequest, res: Response) => {
  const { mints } = req.query;
  if (!mints || typeof mints !== "string") {
    return res.status(400).json({ error: "mints query param required" });
  }

  const mintList = mints.split(",").filter(Boolean);

  const cgMints = mintList.filter((m) => CG_PRICE_IDS[m]);
  if (cgMints.length > 0) {
    try {
      const cgIds = cgMints.map((m) => CG_PRICE_IDS[m]);
      const cgRes = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${cgIds.join(",")}&vs_currencies=usd`,
        { signal: AbortSignal.timeout(5_000) }
      );
      if (cgRes.ok) {
        const cgJson = (await cgRes.json()) as Record<string, { usd?: number }>;
        const cgPrices: Record<string, number> = {};
        for (const mint of cgMints) {
          const id = CG_PRICE_IDS[mint];
          const price = cgJson[id]?.usd;
          if (price && price > 0) cgPrices[mint] = price;
        }
        if (Object.keys(cgPrices).length === mintList.length) return res.json(cgPrices);
        req._cgPrices = cgPrices;
      }
    } catch {
      // fall through
    }
  }

  const headers: Record<string, string> = env.JUP_API_KEY
    ? { Authorization: `Bearer ${env.JUP_API_KEY}` }
    : {};

  for (const url of [
    `https://api.jup.ag/price/v2?ids=${mints}`,
    `https://lite.jup.ag/price/v2?ids=${mints}`,
  ]) {
    try {
      const jupRes = await fetch(url, { headers, signal: AbortSignal.timeout(6_000) });
      if (!jupRes.ok) continue;
      const json = (await jupRes.json()) as { data?: Record<string, { price?: string }> };
      const prices: Record<string, number> = { ...(req._cgPrices ?? {}) };
      for (const [mint, info] of Object.entries(json.data ?? {})) {
        const price = parseFloat(info?.price ?? "");
        if (price > 0) prices[mint] = price;
      }
      if (Object.keys(prices).length > 0) return res.json(prices);
    } catch {
      // try next
    }
  }

  try {
    const birdeyeHdrs: Record<string, string> = { "X-Chain": "solana" };
    if (env.BIRDEYE_API_KEY) birdeyeHdrs["X-API-KEY"] = env.BIRDEYE_API_KEY;
    const birdRes = await fetch(
      `https://public-api.birdeye.so/defi/multi_price?list_address=${mintList.join(",")}`,
      { headers: birdeyeHdrs, signal: AbortSignal.timeout(6_000) }
    );
    if (birdRes.ok) {
      const json = (await birdRes.json()) as { data?: Record<string, { value?: number | string }> };
      const prices: Record<string, number> = { ...(req._cgPrices ?? {}) };
      for (const [mint, info] of Object.entries(json.data ?? {})) {
        const price = parseFloat(String(info?.value ?? ""));
        if (price > 0) prices[mint] = price;
      }
      if (Object.keys(prices).length > 0) return res.json(prices);
    }
  } catch {
    // ignore
  }

  if (req._cgPrices && Object.keys(req._cgPrices).length > 0) return res.json(req._cgPrices);

  console.warn("[prices] all price sources failed for mints:", mints);
  return res.status(502).json({ error: "Price data temporarily unavailable" });
});
