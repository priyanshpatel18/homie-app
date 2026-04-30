"use client";

import {
  ChartLineData01Icon,
  Coins01Icon,
  CoinsSwapIcon,
  SparklesIcon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

interface QuickAction {
  label: string;
  prompt: string;
  icon: IconSvgElement;
}

const ACTIONS: QuickAction[] = [
  {
    label: "Portfolio",
    prompt: "Walk me through my portfolio.",
    icon: Wallet01Icon,
  },
  {
    label: "Yields",
    prompt: "What are the safest yields right now?",
    icon: ChartLineData01Icon,
  },
  {
    label: "Stake SOL",
    prompt: "Best place to stake 1 SOL today?",
    icon: SparklesIcon,
  },
  {
    label: "Swap",
    prompt: "Swap 1 SOL to USDC.",
    icon: CoinsSwapIcon,
  },
  {
    label: "Lend USDC",
    prompt: "Where can I lend 200 USDC safely?",
    icon: Coins01Icon,
  },
];

interface QuickActionsProps {
  onPick: (prompt: string) => void;
  disabled?: boolean;
}

export function QuickActions({ onPick, disabled }: QuickActionsProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
      {ACTIONS.map((a) => (
        <button
          key={a.label}
          type="button"
          onClick={() => onPick(a.prompt)}
          disabled={disabled}
          className="group inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.025] px-3.5 py-2 text-[13px] text-white/70 transition hover:border-white/20 hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
          aria-label={a.prompt}
        >
          <HugeiconsIcon
            icon={a.icon}
            size={14}
            strokeWidth={1.6}
            className="text-white/55 transition group-hover:text-[#00F666]"
          />
          <span>{a.label}</span>
        </button>
      ))}
    </div>
  );
}
