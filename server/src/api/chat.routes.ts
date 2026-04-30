import { Router, type Request, type Response } from "express";
import { getHistory, pushHistory } from "../db/conversationStore";
import { MAX_HISTORY } from "../config/env";
import { requireAuth } from "../middleware/auth";
import { requireWalletOwnership } from "../middleware/walletOwnership";
import type { ChatRequestBody, WalletContext, ChatHistoryEntry } from "../types/chat";

const { agentChat, agentChatStream } = require("../ai/agent") as {
  agentChat: (
    message: string,
    history: ChatHistoryEntry[],
    walletContext: WalletContext
  ) => Promise<unknown>;
  agentChatStream: (
    message: string,
    history: ChatHistoryEntry[],
    walletContext: WalletContext,
    onProgress: (statusText: string) => void
  ) => Promise<unknown>;
};

const { chat } = require("../ai/chat") as {
  chat: (message: string, ctx: unknown) => Promise<{ tip?: string } & Record<string, unknown>>;
};

const { fetchPortfolio } = require("../data/fetchPortfolio") as {
  fetchPortfolio: (wallet: string, network?: string) => Promise<unknown>;
};

export const chatRouter: Router = Router();

function buildWalletContext(body: ChatRequestBody): WalletContext {
  return {
    walletAddress: body.walletAddress,
    solBalance: body.solBalance,
    tradeMode: body.tradeMode,
    network: body.network ?? "mainnet",
    userProfile: body.userProfile ?? null,
    autopilotConfig: body.autopilotConfig ?? null,
    sandboxMode: !!body.sandboxMode,
    sandboxVirtualBalances: body.sandboxVirtualBalances ?? null,
  };
}

chatRouter.post("/", requireAuth, requireWalletOwnership, async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as ChatRequestBody;
    const { message, walletAddress, conversationHistory: clientHistory } = body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Send a message, homie." });
    }

    const history =
      clientHistory && clientHistory.length > 0
        ? clientHistory.slice(-MAX_HISTORY)
        : getHistory(walletAddress);

    const walletContext = buildWalletContext(body);

    const response = await agentChat(message, history, walletContext);
    pushHistory(walletAddress, message, response);

    res.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Agent error:", msg);

    try {
      const body = (req.body ?? {}) as ChatRequestBody;
      const { message, walletAddress, solBalance, tradeMode } = body;
      const portfolio = walletAddress
        ? await fetchPortfolio(walletAddress).catch(() => null)
        : null;
      const fallback = await chat(message ?? "", {
        walletAddress,
        solBalance,
        tradeMode,
        portfolio,
      });
      res.json({
        ...fallback,
        tip: fallback.tip || "Note: I used a simpler brain for this response.",
      });
    } catch {
      res.status(500).json({
        error: "something went sideways on my end, try again in a sec.",
      });
    }
  }
});

chatRouter.post("/stream", requireAuth, requireWalletOwnership, async (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  try {
    const body = (req.body ?? {}) as ChatRequestBody;
    const { message, walletAddress, conversationHistory: clientHistory } = body;

    if (!message || typeof message !== "string") {
      res.write(
        `data: ${JSON.stringify({ type: "error", text: "Send a message, homie." })}\n\n`
      );
      res.end();
      return;
    }

    const history =
      clientHistory && clientHistory.length > 0
        ? clientHistory.slice(-MAX_HISTORY)
        : getHistory(walletAddress);

    const walletContext = buildWalletContext(body);

    const onProgress = (statusText: string): void => {
      res.write(`data: ${JSON.stringify({ type: "status", text: statusText })}\n\n`);
    };

    const response = await agentChatStream(message, history, walletContext, onProgress);

    pushHistory(walletAddress, message, response);

    res.write(`data: ${JSON.stringify({ type: "result", data: response })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Stream agent error:", msg);
    res.write(
      `data: ${JSON.stringify({ type: "error", text: "Something broke. Try again." })}\n\n`
    );
    res.end();
  }
});
