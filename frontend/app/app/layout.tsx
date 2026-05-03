import { PrivyClientProvider } from "@/components/chat/privy-provider";

export const metadata = {
  title: "Homie",
  description: "Home, Positions, Automations, and Chat in one place.",
};

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PrivyClientProvider>{children}</PrivyClientProvider>;
}
