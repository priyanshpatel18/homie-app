"use client";

import * as React from "react";

import { TooltipProvider } from "@/components/ui/tooltip";

import { AppTopBar } from "./app-top-bar";
import { AutomationsTab } from "./automations-tab";
import { ChatTab } from "./chat-tab";
import { HomeTab } from "./home-tab";
import { OnboardingSheet } from "./onboarding-sheet";
import { PositionsTab } from "./positions-tab";
import type { AppTab } from "./tabs";

export function AppShell({ initialTab }: { initialTab: AppTab }) {
  const [tab, setTab] = React.useState<AppTab>(initialTab);

  React.useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const current = url.searchParams.get("tab");
    if (current === tab) return;
    url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", url.toString());
  }, [tab]);

  return (
    <TooltipProvider delay={150}>
      <div className="flex h-[100dvh] flex-col">
        <AppTopBar activeTab={tab} onTabChange={setTab} />
        <main className="relative flex-1 min-h-0 overflow-hidden">
          {tab === "home" && <HomeTab />}
          {tab === "positions" && <PositionsTab />}
          {tab === "automations" && <AutomationsTab />}
          {tab === "chat" && <ChatTab />}
        </main>
        <OnboardingSheet />
      </div>
    </TooltipProvider>
  );
}
