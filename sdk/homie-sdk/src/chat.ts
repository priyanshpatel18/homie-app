import { request, getConfig } from "./client";
import type {
  AgentResponse,
  ChatRequest,
  StreamEvent,
  WalletContext,
  ChatMessage,
} from "./types";

// ─── Build the shared request body ──────────────────────────────────────────

function buildChatBody(req: ChatRequest) {
  const w = req.wallet ?? {};
  return {
    message: req.message,
    walletAddress: w.walletAddress ?? null,
    solBalance: w.solBalance ?? null,
    tradeMode: w.tradeMode ?? "ask",
    network: w.network ?? "mainnet",
    userProfile: w.userProfile ?? null,
    autopilotConfig: w.autopilotConfig ?? null,
    sandboxMode: w.sandboxMode ?? false,
    sandboxVirtualBalances: w.sandboxVirtualBalances ?? null,
    conversationHistory: req.conversationHistory ?? [],
  };
}

// ─── One-shot chat ──────────────────────────────────────────────────────────

/**
 * Send a message and get the full response (waits for the agent loop to finish).
 *
 * ```ts
 * const res = await chat({
 *   message: "What's the best SOL staking yield?",
 *   wallet: { walletAddress: "abc...", solBalance: 12.5 },
 * });
 * console.log(res.reply);
 * ```
 */
export async function chat(
  req: ChatRequest,
  signal?: AbortSignal,
): Promise<AgentResponse> {
  return request<AgentResponse>("/api/chat", {
    body: buildChatBody(req),
    signal,
    timeout: 60_000, // agent loop can take a while
  });
}

// ─── Streaming chat ─────────────────────────────────────────────────────────

export interface StreamCallbacks {
  onStatus?: (text: string) => void;
  onResult?: (data: AgentResponse) => void;
  onError?: (error: Error) => void;
}

/**
 * Stream a chat response via SSE — get real-time status updates as the agent
 * calls tools, then the final result.
 *
 * Uses XMLHttpRequest under the hood because:
 * 1. fetch ReadableStream is broken/missing in React Native
 * 2. XHR onprogress works identically on RN and web
 *
 * Returns a Promise that resolves with the final AgentResponse.
 *
 * ```ts
 * const result = await chatStream(
 *   { message: "Swap 1 SOL to USDC", wallet: { walletAddress: "..." } },
 *   {
 *     onStatus: (s) => console.log("⏳", s),
 *     onResult: (r) => console.log("✅", r.reply),
 *   },
 * );
 * ```
 */
export function chatStream(
  req: ChatRequest,
  callbacks: StreamCallbacks = {},
  signal?: AbortSignal,
): Promise<AgentResponse> {
  const cfg = getConfig();
  const url = `${cfg.baseUrl}/api/chat/stream`;
  const body = JSON.stringify(buildChatBody(req));

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Content-Type", "application/json");
    if (cfg.token) xhr.setRequestHeader("Authorization", `Bearer ${cfg.token}`);

    // Wire up abort signal
    if (signal) {
      signal.addEventListener("abort", () => {
        xhr.abort();
        reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
      });
    }

    let lastIndex = 0;
    let finalResult: AgentResponse | null = null;

    xhr.onprogress = () => {
      const chunk = xhr.responseText.substring(lastIndex);
      lastIndex = xhr.responseText.length;

      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") continue;

        try {
          const event = JSON.parse(payload) as StreamEvent;

          switch (event.type) {
            case "status":
              callbacks.onStatus?.(event.text);
              break;
            case "result":
              finalResult = event.data;
              callbacks.onResult?.(event.data);
              break;
            case "error":
              callbacks.onError?.(new Error(event.text));
              reject(new Error(event.text));
              return;
          }
        } catch {
          // malformed line — skip
        }
      }
    };

    xhr.onload = () => {
      if (finalResult) {
        resolve(finalResult);
      } else {
        const err = new Error("Stream ended without a result");
        callbacks.onError?.(err);
        reject(err);
      }
    };

    xhr.onerror = () => {
      const err = new Error("Stream connection failed");
      callbacks.onError?.(err);
      reject(err);
    };

    xhr.send(body);
  });
}

// ─── Convenience: build a managed conversation ──────────────────────────────

/**
 * Tiny helper to manage conversation history client-side.
 * Not a class — just returns an object with functions.
 *
 * ```ts
 * const convo = conversation({ walletAddress: "abc..." });
 * const r1 = await convo.send("What's my balance?");
 * const r2 = await convo.send("Stake half my SOL");
 * ```
 */
export function conversation(wallet?: WalletContext, maxHistory = 20) {
  const history: ChatMessage[] = [];

  return {
    get history() {
      return [...history];
    },

    async send(message: string, signal?: AbortSignal): Promise<AgentResponse> {
      const res = await chat(
        { message, wallet, conversationHistory: history },
        signal,
      );

      // Append to local history
      history.push({ role: "user", content: message });
      history.push({ role: "assistant", content: res.text ?? JSON.stringify(res) });

      // Trim
      while (history.length > maxHistory * 2) {
        history.shift();
      }

      return res;
    },

    async sendStream(
      message: string,
      callbacks?: StreamCallbacks,
      signal?: AbortSignal,
    ): Promise<AgentResponse> {
      const res = await chatStream(
        { message, wallet, conversationHistory: history },
        callbacks,
        signal,
      );

      history.push({ role: "user", content: message });
      history.push({ role: "assistant", content: res.text ?? JSON.stringify(res) });

      while (history.length > maxHistory * 2) {
        history.shift();
      }

      return res;
    },

    clear() {
      history.length = 0;
    },
  };
}
