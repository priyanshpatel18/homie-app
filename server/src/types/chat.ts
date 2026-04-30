export type ChatRole = "user" | "assistant" | "system" | "tool";

export interface ChatHistoryEntry {
  role: ChatRole;
  content: string;
}

export interface WalletContext {
  walletAddress?: string;
  solBalance?: number;
  tradeMode?: "auto" | "ask" | "learn";
  network?: string;
  userProfile?: unknown;
  autopilotConfig?: unknown;
  sandboxMode?: boolean;
  sandboxVirtualBalances?: unknown;
}

export interface ChatRequestBody extends WalletContext {
  message?: string;
  conversationHistory?: ChatHistoryEntry[];
}
