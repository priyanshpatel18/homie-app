import { Router, type Request, type Response } from "express";
import { client } from "../ai/llmConfig";

export const embedRouter: Router = Router();

embedRouter.post("/", async (req: Request, res: Response) => {
  const { text } = req.body ?? {};
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "text required" });
  }

  try {
    const response = await client.embeddings.create({
      model: "openai/text-embedding-3-small",
      input: text.slice(0, 1500),
    });
    res.json({ embedding: response.data[0].embedding });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[embed] failed:", msg);
    res.status(500).json({ error: msg });
  }
});
