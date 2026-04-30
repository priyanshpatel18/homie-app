import OpenAI from "openai";
import { env } from "../config/env";

export const LLM_BASE_URL = env.LLM_BASE_URL;
export const LLM_API_KEY = env.LLM_API_KEY;
export const LLM_MODEL = env.LLM_MODEL;

export const client: OpenAI = new OpenAI({
  apiKey: LLM_API_KEY,
  baseURL: LLM_BASE_URL,
});

export async function createWithRetry(
  params: Parameters<typeof client.chat.completions.create>[0],
  maxRetries = 4
): Promise<unknown> {
  let delay = 2000;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await client.chat.completions.create(params);
    } catch (err) {
      const e = err as {
        status?: number;
        response?: { status?: number };
        headers?: Record<string, string>;
      };
      const status = e?.status ?? e?.response?.status;
      if (status === 429 && attempt < maxRetries) {
        const retryAfter = e?.headers?.["retry-after"];
        const wait = retryAfter ? parseInt(retryAfter, 10) * 1000 : delay;
        console.warn(
          `[LLM] 429 rate limit, waiting ${wait}ms, retry ${attempt + 1}/${maxRetries}`
        );
        await new Promise((r) => setTimeout(r, wait));
        delay = Math.min(delay * 2, 30000);
        continue;
      }
      throw err;
    }
  }
  throw new Error("createWithRetry exhausted retries");
}

const hostname = new URL(LLM_BASE_URL).hostname;
console.log(`[LLM] Provider: ${hostname} | Model: ${LLM_MODEL}`);
