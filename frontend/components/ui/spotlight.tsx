"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Cursor-follow spotlight (Aceternity-style). Hover glow is subtle on dark UI.
 */
export function SpotlightCard({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-5 backdrop-blur-sm transition-colors duration-300 hover:border-white/[0.14]",
        className
      )}
      onMouseMove={(e) => {
        const el = e.currentTarget;
        const { left, top } = el.getBoundingClientRect();
        el.style.setProperty("--spot-x", `${e.clientX - left}px`);
        el.style.setProperty("--spot-y", `${e.clientY - top}px`);
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.removeProperty("--spot-x");
        el.style.removeProperty("--spot-y");
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100 max-md:opacity-0"
        style={{
          background:
            "radial-gradient(520px circle at var(--spot-x, 50%) var(--spot-y, 40%), rgba(0,246,102,0.055), transparent 42%)",
        }}
      />
      <div className="relative z-[1] flex h-full flex-col">{children}</div>
    </div>
  );
}
