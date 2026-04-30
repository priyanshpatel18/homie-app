// Priority: EXPO_PUBLIC_API_URL env var → Android emulator fallback
// Set EXPO_PUBLIC_API_URL in homie-app/.env for real devices (e.g. http://192.168.1.x:3000)
export const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://10.0.2.2:3000";

export async function askHomie(message, wallet = {}, conversationHistory = [], signal) {
  const { walletAddress, solBalance, tradeMode = "ask", network = "mainnet", userProfile = null, autopilotConfig = null, sandboxMode = false, sandboxVirtualBalances = null } = wallet;

  const response = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      walletAddress: walletAddress ?? null,
      solBalance: solBalance ?? null,
      tradeMode,
      network,
      userProfile,
      autopilotConfig,
      sandboxMode,
      sandboxVirtualBalances,
      conversationHistory,
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Server error: ${response.status}`);
  }

  return response.json();
}

/**
 * Streaming version of askHomie.
 * Uses XMLHttpRequest to read SSE events from /api/chat/stream.
 * Calls onStatus(text) for each progress update (e.g. "📊 Checking yields...").
 * Returns the final structured response.
 *
 * @param {string} message
 * @param {Object} wallet - { walletAddress, solBalance, tradeMode }
 * @param {Array} conversationHistory
 * @param {function(string): void} onStatus - callback for progress updates
 * @returns {Promise<Object>} final agent response
 */
export function askHomieStream(message, wallet = {}, conversationHistory = [], onStatus, signal) {
  const { walletAddress, solBalance, tradeMode = "ask", network = "mainnet", userProfile = null, autopilotConfig = null, sandboxMode = false, sandboxVirtualBalances = null } = wallet;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}/api/chat/stream`);
    xhr.setRequestHeader("Content-Type", "application/json");

    if (signal) {
      signal.addEventListener("abort", () => {
        xhr.abort();
        reject(Object.assign(new Error("AbortError"), { name: "AbortError" }));
      });
    }

    let lastIndex = 0;
    let finalResult = null;

    xhr.onprogress = () => {
      // Parse new SSE data since last check
      const newData = xhr.responseText.substring(lastIndex);
      lastIndex = xhr.responseText.length;

      // Split into SSE lines
      const lines = newData.split("\n");
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();

        if (payload === "[DONE]") continue;

        try {
          const event = JSON.parse(payload);

          if (event.type === "status" && onStatus) {
            onStatus(event.text);
          } else if (event.type === "result") {
            finalResult = event.data;
          } else if (event.type === "error") {
            reject(new Error(event.text));
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    };

    xhr.onload = () => {
      if (finalResult) {
        resolve(finalResult);
      } else {
        reject(new Error("No result received from stream"));
      }
    };

    xhr.onerror = () => {
      reject(new Error("Stream connection failed"));
    };

    xhr.send(JSON.stringify({
      message,
      walletAddress: walletAddress ?? null,
      solBalance: solBalance ?? null,
      tradeMode,
      network,
      userProfile,
      autopilotConfig,
      sandboxMode,
      sandboxVirtualBalances,
      conversationHistory,
    }));
  });
}

export async function fetchTokenChartRange(symbol, range) {
  const response = await fetch(`${API_URL}/api/chart/${symbol}/${range}`);
  if (!response.ok) throw new Error(`Chart error: ${response.status}`);
  return response.json();
}

export async function fetchPortfolio(walletAddress, network = "mainnet") {
  const response = await fetch(`${API_URL}/api/portfolio/${walletAddress}?network=${network}`, {
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error(`Portfolio error: ${response.status}`);
  return response.json();
}
