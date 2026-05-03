"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function PositionsTab() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.18em] text-white/40">
            Positions
          </span>
          <h1 className="font-serif text-3xl tracking-tight text-white">
            Open positions
          </h1>
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex items-center gap-4 border-b border-white/[0.04] pb-4 last:border-0 last:pb-0"
              >
                <Skeleton className="size-10 rounded-full bg-white/[0.05]" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-1/3 bg-white/[0.05]" />
                  <Skeleton className="h-2.5 w-1/4 bg-white/[0.04]" />
                </div>
                <Skeleton className="h-7 w-20 bg-white/[0.05]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
