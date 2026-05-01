"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import * as React from "react";

const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

export function PrivyClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!APP_ID) {
    if (typeof window !== "undefined") {
      console.warn(
        "[privy] NEXT_PUBLIC_PRIVY_APP_ID is not set — auth is disabled."
      );
    }
    return <>{children}</>;
  }

  return (
    <PrivyProvider
      appId={APP_ID}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#00F666",
          logo: "/homie/mainlogo.svg",
          walletChainType: "solana-only",
        },
        loginMethods: ["email", "google", "apple", "wallet"],
        embeddedWallets: {
          solana: { createOnLogin: "users-without-wallets" },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
