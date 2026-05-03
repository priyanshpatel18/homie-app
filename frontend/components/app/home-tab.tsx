"use client";

import * as React from "react";

import { Skeleton } from "@/components/ui/skeleton";

import { usePracticeMode } from "./practice-toggle";

function SlotShell({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
      <header className="flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-[0.18em] text-white/40">
          {eyebrow}
        </span>
        <h2 className="text-[15px] font-medium tracking-tight text-white/90">
          {title}
        </h2>
      </header>
      {children}
    </section>
  );
}

function IdleBalanceSlot() {
  return (
    <SlotShell eyebrow="Idle" title="Idle balance">
      <Skeleton className="h-9 w-40 bg-white/[0.05]" />
      <Skeleton className="h-3 w-3/4 bg-white/[0.04]" />
    </SlotShell>
  );
}

function PositionsSlot() {
  return (
    <SlotShell eyebrow="Open" title="Positions">
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-full bg-white/[0.05]" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-1/2 bg-white/[0.05]" />
              <Skeleton className="h-3 w-1/3 bg-white/[0.04]" />
            </div>
            <Skeleton className="h-6 w-16 bg-white/[0.05]" />
          </div>
        ))}
      </div>
    </SlotShell>
  );
}

function DailyStatsSlot() {
  return (
    <SlotShell eyebrow="Yesterday" title="Daily stats">
      <div className="grid grid-cols-2 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-2.5 w-20 bg-white/[0.04]" />
            <Skeleton className="h-6 w-24 bg-white/[0.05]" />
          </div>
        ))}
      </div>
    </SlotShell>
  );
}

function SuggestionSlot() {
  return (
    <SlotShell eyebrow="Top suggestion" title="What Homie would do">
      <Skeleton className="h-4 w-3/4 bg-white/[0.05]" />
      <Skeleton className="h-3 w-full bg-white/[0.04]" />
      <Skeleton className="h-3 w-5/6 bg-white/[0.04]" />
      <div className="pt-2">
        <Skeleton className="h-9 w-32 rounded-full bg-white/[0.05]" />
      </div>
    </SlotShell>
  );
}

export function HomeTab() {
  const [practice] = usePracticeMode();

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.18em] text-white/40">
              Home
            </span>
            <h1 className="font-serif text-3xl tracking-tight text-white">
              Today
            </h1>
          </div>
          {practice && (
            <span className="rounded-full border border-[#00F666]/30 bg-[#00F666]/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-[#00F666]">
              Practice
            </span>
          )}
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <IdleBalanceSlot />
          <PositionsSlot />
          <DailyStatsSlot />
          <SuggestionSlot />
        </div>
      </div>
    </div>
  );
}
