"use client";

import { Skeleton } from "@/components/ui/skeleton";

function MessageRow({
  align,
  width,
}: {
  align: "left" | "right";
  width: string;
}) {
  return (
    <div
      className={
        align === "right"
          ? "flex justify-end"
          : "flex items-start gap-3"
      }
    >
      {align === "left" && (
        <Skeleton className="size-7 shrink-0 rounded-full bg-white/[0.05]" />
      )}
      <div className="space-y-2">
        <Skeleton className={`h-3 ${width} bg-white/[0.05]`} />
        <Skeleton className={`h-3 ${width} bg-white/[0.04]`} />
      </div>
    </div>
  );
}

export function ChatTab() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex h-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.18em] text-white/40">
            Chat
          </span>
          <h1 className="font-serif text-3xl tracking-tight text-white">
            Ask Homie
          </h1>
        </div>

        <div className="flex flex-1 flex-col rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="flex-1 space-y-5 overflow-y-auto">
            <MessageRow align="left" width="w-72" />
            <MessageRow align="right" width="w-56" />
            <MessageRow align="left" width="w-80" />
            <MessageRow align="right" width="w-40" />
            <MessageRow align="left" width="w-64" />
          </div>

          <div className="mt-5 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <Skeleton className="h-4 flex-1 bg-white/[0.05]" />
            <Skeleton className="size-9 rounded-full bg-white/[0.05]" />
          </div>
        </div>
      </div>
    </div>
  );
}
