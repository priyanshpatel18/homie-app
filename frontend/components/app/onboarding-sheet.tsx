"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { usePrivy } from "@privy-io/react-auth";
import * as React from "react";

import { ensureHomieInit } from "@/lib/homie";
import { cn } from "@/lib/utils";

export const ONBOARDING_STORAGE_KEY = "homie:onboarding";

export type OnboardingGoal = "passive_income" | "grow" | "explore";
export type OnboardingVerbosity = "explain" | "key_insight" | "execute_report";

export interface OnboardingChoices {
  goal: OnboardingGoal;
  verbosity: OnboardingVerbosity;
  completedAt: number;
}

const GOAL_OPTIONS: ReadonlyArray<{
  id: OnboardingGoal;
  title: string;
  desc: string;
}> = [
  {
    id: "passive_income",
    title: "Passive income",
    desc: "Steady yield, low touch. Park it and let it earn.",
  },
  {
    id: "grow",
    title: "Grow my bag",
    desc: "Compound aggressively. Willing to take more risk.",
  },
  {
    id: "explore",
    title: "Just exploring",
    desc: "Show me what's out there. I'll decide as I go.",
  },
];

const VERBOSITY_OPTIONS: ReadonlyArray<{
  id: OnboardingVerbosity;
  title: string;
  desc: string;
}> = [
  {
    id: "explain",
    title: "Explain everything",
    desc: "Walk me through what's happening and why.",
  },
  {
    id: "key_insight",
    title: "Just the key insight",
    desc: "One-line takeaway, then the action.",
  },
  {
    id: "execute_report",
    title: "Execute and report",
    desc: "Skip the talk. Do it, then tell me what happened.",
  },
];

function readStored(): OnboardingChoices | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OnboardingChoices>;
    if (!parsed?.goal || !parsed?.verbosity) return null;
    return parsed as OnboardingChoices;
  } catch {
    return null;
  }
}

function OptionCard({
  active,
  title,
  desc,
  onClick,
}: {
  active: boolean;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "group flex w-full flex-col items-start gap-1 rounded-xl border px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F666] focus-visible:ring-offset-2 focus-visible:ring-offset-[#040405] sm:px-4 sm:py-3.5",
        active
          ? "border-[#00F666]/60 bg-[#00F666]/[0.06]"
          : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.18] hover:bg-white/[0.04]"
      )}
    >
      <span
        className={cn(
          "text-[13.5px] font-medium tracking-tight sm:text-[14px]",
          active ? "text-white" : "text-white/85"
        )}
      >
        {title}
      </span>
      <span className="text-[12px] leading-relaxed text-white/55 sm:text-[12.5px]">
        {desc}
      </span>
    </button>
  );
}

export function OnboardingSheet() {
  const { ready, authenticated, user, getAccessToken } = usePrivy();

  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<0 | 1>(0);
  const [goal, setGoal] = React.useState<OnboardingGoal | null>(null);
  const [verbosity, setVerbosity] = React.useState<OnboardingVerbosity | null>(
    null
  );
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (readStored()) return;
    setOpen(true);
  }, []);

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

  async function handleSubmit() {
    if (!goal || !verbosity) return;
    setError(null);
    setSubmitting(true);

    const choices: OnboardingChoices = {
      goal,
      verbosity,
      completedAt: Date.now(),
    };

    try {
      window.localStorage.setItem(
        ONBOARDING_STORAGE_KEY,
        JSON.stringify(choices)
      );
    } catch {
      // local storage unavailable; still try the network
    }

    if (ready && authenticated && walletAddress) {
      try {
        ensureHomieInit();
        const { savePreferences } = await import("@homie/sdk");
        await savePreferences({ walletAddress, goal, verbosity });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Saved locally. Server sync failed: ${msg}`);
      }
    }

    setSubmitting(false);
    setOpen(false);
    void getAccessToken;
  }

  const onStep0Next = () => {
    if (goal) setStep(1);
  };

  const completed = !!goal && !!verbosity;

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !completed) return;
        setOpen(next);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-black/80 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs"
          )}
        />
        <DialogPrimitive.Popup
          aria-describedby={undefined}
          className={cn(
            "fixed z-50 flex flex-col bg-[#040405]/95 text-popover-foreground shadow-xl transition duration-200 ease-in-out supports-backdrop-filter:backdrop-blur-md",
            // Mobile: bottom sheet
            "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-3xl border-t border-white/[0.06]",
            "data-ending-style:opacity-0 data-starting-style:opacity-0",
            "data-ending-style:translate-y-6 data-starting-style:translate-y-6",
            // Desktop (sm+): centered modal
            "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:max-h-[85dvh] sm:w-[min(92vw,32rem)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:border-white/[0.08]",
            "sm:data-ending-style:translate-y-[calc(-50%+12px)] sm:data-starting-style:translate-y-[calc(-50%+12px)]"
          )}
        >
          <div className="flex max-h-[inherit] w-full flex-col overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] pt-5 sm:px-7 sm:pb-7 sm:pt-7">
            <header className="flex flex-col gap-1.5">
              <span className="text-[10.5px] uppercase tracking-[0.18em] text-white/40 sm:text-[11px]">
                Step {step + 1} of 2
              </span>
              <DialogPrimitive.Title className="font-serif text-[22px] leading-tight tracking-tight text-white sm:text-2xl">
                {step === 0
                  ? "What are you here for?"
                  : "How chatty should I be?"}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-[12.5px] leading-relaxed text-white/55 sm:text-[13px]">
                {step === 0
                  ? "Pick the one that fits best. You can change it later."
                  : "Choose how Homie reports back when it's working for you."}
              </DialogPrimitive.Description>
            </header>

            <div className="mt-5 flex flex-col gap-2 sm:gap-2.5">
              {step === 0
                ? GOAL_OPTIONS.map((opt) => (
                    <OptionCard
                      key={opt.id}
                      active={goal === opt.id}
                      title={opt.title}
                      desc={opt.desc}
                      onClick={() => setGoal(opt.id)}
                    />
                  ))
                : VERBOSITY_OPTIONS.map((opt) => (
                    <OptionCard
                      key={opt.id}
                      active={verbosity === opt.id}
                      title={opt.title}
                      desc={opt.desc}
                      onClick={() => setVerbosity(opt.id)}
                    />
                  ))}
            </div>

            {error && (
              <p className="mt-3 text-[12px] text-amber-300/85">{error}</p>
            )}

            <div className="mt-5 flex items-center justify-between gap-3">
              {step === 1 ? (
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  className="text-[13px] text-white/55 hover:text-white/80"
                >
                  Back
                </button>
              ) : (
                <span />
              )}

              {step === 0 ? (
                <button
                  type="button"
                  onClick={onStep0Next}
                  disabled={!goal}
                  className={cn(
                    "inline-flex h-10 min-w-[120px] items-center justify-center rounded-full px-5 text-[13px] font-medium tracking-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F666] focus-visible:ring-offset-2 focus-visible:ring-offset-[#040405] sm:h-10 sm:text-[13.5px]",
                    goal
                      ? "bg-[#00F666] text-[#040405] hover:bg-[#00ff70]"
                      : "bg-white/[0.06] text-white/35"
                  )}
                >
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!verbosity || submitting}
                  className={cn(
                    "inline-flex h-10 min-w-[140px] items-center justify-center rounded-full px-5 text-[13px] font-medium tracking-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F666] focus-visible:ring-offset-2 focus-visible:ring-offset-[#040405] sm:h-10 sm:text-[13.5px]",
                    verbosity && !submitting
                      ? "bg-[#00F666] text-[#040405] hover:bg-[#00ff70]"
                      : "bg-white/[0.06] text-white/35"
                  )}
                >
                  {submitting ? "Saving…" : "Get started"}
                </button>
              )}
            </div>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function useOnboardingChoices(): OnboardingChoices | null {
  const [choices, setChoices] = React.useState<OnboardingChoices | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    setChoices(readStored());

    const onStorage = (e: StorageEvent) => {
      if (e.key === ONBOARDING_STORAGE_KEY) setChoices(readStored());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return choices;
}
