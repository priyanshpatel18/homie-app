import { PrivyClientProvider } from "@/components/chat/privy-provider";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PrivyClientProvider>{children}</PrivyClientProvider>;
}
