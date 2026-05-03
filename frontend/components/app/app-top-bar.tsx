"use client";

import Image from "next/image";
import Link from "next/link";
import * as React from "react";

import { ConnectButton } from "@/components/chat/connect-button";
import { cn } from "@/lib/utils";

import { PracticeToggle } from "./practice-toggle";
import { APP_TABS, type AppTab } from "./tabs";

const TAB_LABELS: Record<AppTab, string> = {
  home: "Home",
  positions: "Positions",
  automations: "Automations",
  chat: "Chat",
};

export function AppTopBar({
  activeTab,
  onTabChange,
}: {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}) {
  return (
    <header className="relative z-20 shrink-0">
      <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between px-5 py-5 sm:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F666] focus-visible:ring-offset-2 focus-visible:ring-offset-[#040405]"
          aria-label="HeyHomieAI home"
        >
          <span className="relative inline-block size-6">
            <Image
              src="/homie/mainlogo.svg"
              alt=""
              fill
              priority
              className="object-contain"
            />
          </span>
          <span className="text-sm font-medium tracking-tight text-white/90">
            HeyHomieAI
          </span>
        </Link>

        <nav
          aria-label="App sections"
          role="tablist"
          className="flex items-center gap-6"
        >
          {APP_TABS.map((tab) => {
            const active = tab === activeTab;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onTabChange(tab)}
                className={cn(
                  "hh-link text-sm transition-colors",
                  active ? "text-white" : "text-white/75 hover:text-white"
                )}
              >
                {TAB_LABELS[tab]}
              </button>
            );
          })}
          <PracticeToggle />
          <ConnectButton variant="link" />
        </nav>
      </div>
    </header>
  );
}
