"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

const STORAGE_KEY = "homie:practice-mode";

export function usePracticeMode(): [boolean, (next: boolean) => void] {
  const [enabled, setEnabled] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    setEnabled(window.localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  const set = React.useCallback((next: boolean) => {
    setEnabled(next);
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  }, []);

  return [enabled, set];
}

export function PracticeToggle() {
  const [enabled, setEnabled] = usePracticeMode();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => setEnabled(!enabled)}
      className={cn(
        "inline-flex items-center gap-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F666] focus-visible:ring-offset-2 focus-visible:ring-offset-[#040405]",
        enabled ? "text-[#00F666]" : "text-white/75 hover:text-white"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block size-1.5 rounded-full",
          enabled ? "bg-[#00F666]" : "bg-white/40"
        )}
      />
      Practice
    </button>
  );
}
