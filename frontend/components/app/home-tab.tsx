"use client";

import { usePrivy } from "@privy-io/react-auth";
import * as React from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { ensureHomieInit } from "@/lib/homie";
import { cn } from "@/lib/utils";

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
    <section className="flex flex-col gap-3.5 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 sm:gap-4 sm:p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[10.5px] uppercase tracking-[0.18em] text-white/40 sm:text-[11px]">
          {eyebrow}
        </span>
        <h2 className="text-[14px] font-medium tracking-tight text-white/90 sm:text-[15px]">
          {title}
        </h2>
      </header>
      {children}
    </section>
  );
}

interface IdleSuggestion {
  protocol: string;
  action: string;
  rationale: string;
  estimatedApyPct: number;
  preparedTxStub: unknown | null;
}

interface IdleSuggestionResponse {
  walletAddress: string;
  idleSol: number;
  suggestion: IdleSuggestion | null;
}

function formatSol(n: number): string {
  if (n === 0) return "0 SOL";
  if (n < 0.001) return `${n.toFixed(6)} SOL`;
  if (n < 1) return `${n.toFixed(4)} SOL`;
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} SOL`;
}

function IdleBalanceSlot() {
  const { ready, authenticated, user } = usePrivy();

  const walletAddress = React.useMemo<string | null>(() => {
    const accounts = user?.linkedAccounts ?? [];
    for (const acc of accounts) {
      if (
        acc.type === "wallet" &&
        (acc as { chainType?: string }).chainType === "solana"
      ) {
        return (acc as { address?: string }).address ?? null;
      }
    }
    return (user?.wallet as { address?: string } | undefined)?.address ?? null;
  }, [user]);

  const [data, setData] = React.useState<IdleSuggestionResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!ready || !authenticated || !walletAddress) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        ensureHomieInit();
        const { fetchIdleSuggestion } = await import("@homie/sdk");
        const res = await fetchIdleSuggestion(walletAddress);
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, authenticated, walletAddress]);

  const balanceClass =
    "text-[24px] font-medium tracking-tight text-white tabular-nums sm:text-[28px]";
  const helperClass =
    "text-[12.5px] leading-relaxed text-white/55 sm:text-[13px]";

  if (!ready || !authenticated || !walletAddress) {
    return (
      <SlotShell eyebrow="Idle" title="Idle balance">
        <div className={cn(balanceClass, "text-white/90")}>—</div>
        <p className={helperClass}>
          Connect your wallet to see your idle balance and a suggestion for it.
        </p>
      </SlotShell>
    );
  }

  if (loading && !data) {
    return (
      <SlotShell eyebrow="Idle" title="Idle balance">
        <Skeleton className="h-8 w-32 bg-white/[0.05] sm:h-9 sm:w-40" />
        <Skeleton className="h-3 w-3/4 bg-white/[0.04]" />
      </SlotShell>
    );
  }

  if (error) {
    return (
      <SlotShell eyebrow="Idle" title="Idle balance">
        <div className={cn(balanceClass, "text-white/90")}>—</div>
        <p className="text-[12.5px] leading-relaxed text-amber-300/80 sm:text-[13px]">
          Couldn't load balance: {error}
        </p>
      </SlotShell>
    );
  }

  const idleSol = data?.idleSol ?? 0;
  const suggestion = data?.suggestion ?? null;

  return (
    <SlotShell eyebrow="Idle" title="Idle balance">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={balanceClass}>{formatSol(idleSol)}</span>
        {suggestion && (
          <span className="text-[11.5px] tracking-tight text-[#00F666] sm:text-[12px]">
            +{suggestion.estimatedApyPct.toFixed(2)}% APY
          </span>
        )}
      </div>

      {suggestion ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-[12.5px] leading-relaxed text-white/80 sm:text-[13px]">
            {suggestion.rationale}
          </p>
          <p className="text-[10.5px] uppercase tracking-[0.16em] text-white/35 sm:text-[11px]">
            {suggestion.protocol} · {suggestion.action}
          </p>
        </div>
      ) : idleSol > 0 ? (
        <p className={helperClass}>
          Looking for the best place to park this. Check back in a moment.
        </p>
      ) : (
        <p className={helperClass}>
          Nothing idle right now. Add SOL to get a suggestion.
        </p>
      )}
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
        <Skeleton className={cn("h-9 w-32 rounded-full bg-white/[0.05]")} />
      </div>
    </SlotShell>
  );
}

export function HomeTab() {
  const [practice] = usePracticeMode();

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+2rem)] pt-6 sm:gap-6 sm:px-6 sm:pt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[10.5px] uppercase tracking-[0.18em] text-white/40 sm:text-[11px]">
              Home
            </span>
            <h1 className="font-serif text-[26px] leading-tight tracking-tight text-white sm:text-3xl">
              Today
            </h1>
          </div>
          {practice && (
            <span className="rounded-full border border-[#00F666]/30 bg-[#00F666]/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-[#00F666] sm:px-3 sm:text-[11px]">
              Practice
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2">
          <IdleBalanceSlot />
          <PositionsSlot />
          <DailyStatsSlot />
          <SuggestionSlot />
        </div>
      </div>
    </div>
  );
}
