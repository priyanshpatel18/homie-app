import { redirect } from "next/navigation";

export const metadata = {
  title: "Chat with Homie",
  description: "Ask Homie about yields, swaps, staking, and on-chain moves.",
};

export default function ChatPage() {
  redirect("/app?tab=chat");
}
