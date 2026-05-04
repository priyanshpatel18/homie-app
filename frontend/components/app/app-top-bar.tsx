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
    <header className="relative z-20 shrink-0 border-b border-white/[0.04] sm:border-b-0">
      <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-8 sm:py-5">
        <Link
          href="/"
          className="inline-flex shrink-0 items-center gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F666] focus-visible:ring-offset-2 focus-visible:ring-offset-[#040405] sm:gap-2.5"
          aria-label="HeyHomieAI home"
        >
          <span className="relative inline-block size-5 sm:size-6">
            <Image
              src="/homie/mainlogo.svg"
              alt=""
              fill
              priority
              className="object-contain"
            />
          </span>
          <span className="text-[13px] font-medium tracking-tight text-white/90 sm:text-sm">
            HeyHomieAI
          </span>
        </Link>

        <div className="order-3 -mx-4 w-full overflow-x-auto px-4 sm:order-none sm:mx-0 sm:w-auto sm:overflow-visible sm:px-0">
          <nav
            aria-label="App sections"
            role="tablist"
            className="flex min-w-max items-center gap-4 sm:gap-6"
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
                    "hh-link shrink-0 text-[13px] transition-colors sm:text-sm",
                    active ? "text-white" : "text-white/75 hover:text-white"
                  )}
                >
                  {TAB_LABELS[tab]}
                </button>
              );
            })}
            <span className="hidden sm:inline-flex">
              <PracticeToggle />
            </span>
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-3 sm:gap-6">
          <span className="inline-flex sm:hidden">
            <PracticeToggle />
          </span>
          <ConnectButton variant="link" />
        </div>
      </div>
    </header>
  );
}
