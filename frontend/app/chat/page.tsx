import { ChatShell } from "@/components/chat/chat-shell";

export const metadata = {
  title: "Chat with Homie",
  description: "Ask Homie about yields, swaps, staking, and on-chain moves.",
};

export default function ChatPage() {
  return <ChatShell />;
}
