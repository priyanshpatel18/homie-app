"use client";

import {
  ArrowUp01Icon,
  CoinsSwapIcon,
  StopCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as React from "react";

import type { TradeMode } from "@homie/sdk";

const MODE_LABEL: Record<TradeMode, string> = {
  ask: "Ask",
  auto: "Auto",
  learn: "Learn",
};

const MODE_ORDER: TradeMode[] = ["ask", "auto", "learn"];

export interface ComposerProps {
  onSubmit: (message: string) => void;
  onAbort?: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  placeholder?: string;
  mode: TradeMode;
  onModeChange: (mode: TradeMode) => void;
  /** Hero is the larger empty-state card; compact is the chat-state card. */
  variant?: "hero" | "compact";
  /** Imperatively set value from quick actions. */
  initialValue?: string;
  resetKey?: number;
}

export function Composer({
  onSubmit,
  onAbort,
  isStreaming,
  disabled,
  placeholder = "Ask Homie about a yield, a swap, or a position…",
  mode,
  onModeChange,
  variant = "hero",
  initialValue,
  resetKey,
}: ComposerProps) {
  const [value, setValue] = React.useState(initialValue ?? "");
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  React.useEffect(() => {
    if (initialValue !== undefined) setValue(initialValue);
    textareaRef.current?.focus();
  }, [initialValue, resetKey]);

  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, variant === "hero" ? 220 : 160)}px`;
  }, [value, variant]);

  function send() {
    const trimmed = value.trim();
    if (!trimmed || isStreaming || disabled) return;
    onSubmit(trimmed);
    setValue("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function cycleMode() {
    const idx = MODE_ORDER.indexOf(mode);
    onModeChange(MODE_ORDER[(idx + 1) % MODE_ORDER.length]);
  }

  const isHero = variant === "hero";

  return (
    <div
      className={[
        "rounded-3xl border border-white/[0.08] bg-white/[0.025] backdrop-blur-md transition-colors",
        "focus-within:border-[#00F666]/35 focus-within:bg-white/[0.035]",
        isHero ? "px-5 pt-4 pb-3 sm:px-6 sm:pt-5" : "px-4 pt-3 pb-2.5",
      ].join(" ")}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
        placeholder={placeholder}
        aria-label="Message Homie"
        disabled={disabled}
        autoFocus
        className={[
          "block w-full resize-none border-none bg-transparent text-white outline-none placeholder:text-white/40",
          isHero
            ? "min-h-[64px] text-[16px] leading-7"
            : "min-h-[36px] text-[15px] leading-6",
          "scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent",
        ].join(" ")}
      />

      <div className="mt-2 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={cycleMode}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[12px] text-white/65 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white/85"
          aria-label={`Trade mode: ${MODE_LABEL[mode]}. Click to change.`}
        >
          <HugeiconsIcon icon={CoinsSwapIcon} size={13} strokeWidth={1.6} />
          <span className="font-medium">{MODE_LABEL[mode]}</span>
          <span className="font-mono text-white/35">⌄</span>
        </button>

        {isStreaming && onAbort ? (
          <button
            type="button"
            onClick={onAbort}
            aria-label="Stop"
            className="grid size-9 place-items-center rounded-full border border-white/15 bg-white/[0.04] text-white/85 transition hover:border-white/25 hover:bg-white/[0.08]"
          >
            <HugeiconsIcon
              icon={StopCircleIcon}
              size={16}
              strokeWidth={1.5}
            />
          </button>
        ) : (
          <button
            type="button"
            onClick={send}
            disabled={!value.trim() || disabled}
            aria-label="Send"
            className={[
              "grid size-9 place-items-center rounded-full transition",
              value.trim() && !disabled
                ? "bg-[#00F666] text-black hover:scale-[1.04]"
                : "bg-white/[0.06] text-white/35",
            ].join(" ")}
          >
            <HugeiconsIcon icon={ArrowUp01Icon} size={16} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
}
