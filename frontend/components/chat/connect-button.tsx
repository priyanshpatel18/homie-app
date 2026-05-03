"use client";

import { Wallet01Icon, Logout01Icon, Copy01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { usePrivy } from "@privy-io/react-auth";
import * as React from "react";

import { setHomieAuthToken } from "@/lib/homie";
import { cn } from "@/lib/utils";

function shortAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function pickSolanaAddress(user: ReturnType<typeof usePrivy>["user"]): string | null {
  const accounts = user?.linkedAccounts ?? [];
  for (const acc of accounts) {
    if (acc.type === "wallet" && (acc as { chainType?: string }).chainType === "solana") {
      return (acc as { address?: string }).address ?? null;
    }
  }
  const fallback = (user?.wallet as { address?: string } | undefined)?.address;
  return fallback ?? null;
}

export type ConnectButtonProps = {
  variant?: "primary" | "compact" | "link";
  className?: string;
};

export function ConnectButton({
  variant = "primary",
  className,
}: ConnectButtonProps) {
  const { ready, authenticated, login, logout, user, getAccessToken } =
    usePrivy();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!authenticated) {
      setHomieAuthToken(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!cancelled) setHomieAuthToken(token ?? null);
      } catch {
        if (!cancelled) setHomieAuthToken(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticated, getAccessToken]);

  React.useEffect(() => {
    if (!menuOpen) return;
    function onPointer(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [menuOpen]);

  const isCompact = variant === "compact";
  const isLink = variant === "link";

  const baseClass = cn(
    isLink
      ? "inline-flex items-center gap-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F666] focus-visible:ring-offset-2 focus-visible:ring-offset-[#040405]"
      : cn(
          "inline-flex items-center justify-center gap-2.5 rounded-full font-medium tracking-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F666] focus-visible:ring-offset-2 focus-visible:ring-offset-[#040405]",
          isCompact
            ? "h-9 px-4 text-[13px]"
            : "h-11 px-5 text-[14px]"
        ),
    className
  );

  if (!ready) {
    if (isLink) {
      return (
        <span className={cn(baseClass, "text-white/35")}>Loading…</span>
      );
    }
    return (
      <button
        type="button"
        disabled
        className={cn(
          baseClass,
          "border border-white/[0.08] bg-white/[0.04] text-white/40"
        )}
      >
        <HugeiconsIcon icon={Wallet01Icon} size={16} strokeWidth={1.5} />
        <span>Loading…</span>
      </button>
    );
  }

  if (!authenticated) {
    if (isLink) {
      return (
        <button
          type="button"
          onClick={() => login()}
          className={cn(baseClass, "hh-link text-white/75 hover:text-white")}
        >
          Connect
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => login()}
        className={cn(
          baseClass,
          "bg-[#00F666] text-[#040405] shadow-[0_0_0_1px_rgba(0,246,102,0.4),0_8px_30px_-12px_rgba(0,246,102,0.55)] hover:bg-[#00ff70]"
        )}
      >
        <HugeiconsIcon icon={Wallet01Icon} size={16} strokeWidth={2} />
        <span>Connect wallet</span>
      </button>
    );
  }

  const address = pickSolanaAddress(user);
  const label = address
    ? shortAddress(address)
    : user?.email?.address ?? "Connected";

  if (isLink) {
    return (
      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className={cn(baseClass, "text-white/85 hover:text-white")}
        >
          <span
            aria-hidden
            className="inline-block size-1.5 rounded-full bg-[#00F666]"
          />
          <span className="font-mono text-[12px]">{label}</span>
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 overflow-hidden rounded-xl border border-white/[0.08] bg-[#0a0a0c]/95 p-1 shadow-xl backdrop-blur"
          >
            {address && (
              <button
                type="button"
                role="menuitem"
                onClick={async () => {
                  await navigator.clipboard.writeText(address);
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-white/80 hover:bg-white/[0.05]"
              >
                <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={1.5} />
                <span className="truncate">Copy address</span>
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                logout();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-white/80 hover:bg-white/[0.05]"
            >
              <HugeiconsIcon icon={Logout01Icon} size={14} strokeWidth={1.5} />
              <span>Disconnect</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className={cn(
          baseClass,
          "border border-white/[0.1] bg-white/[0.04] text-white/90 hover:border-white/[0.2] hover:bg-white/[0.07]"
        )}
      >
        <span className="grid size-5 place-items-center rounded-full bg-[#00F666]/15 text-[#00F666]">
          <HugeiconsIcon icon={Wallet01Icon} size={11} strokeWidth={2} />
        </span>
        <span className="font-mono text-[12px]">{label}</span>
      </button>

      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 overflow-hidden rounded-xl border border-white/[0.08] bg-[#0a0a0c]/95 p-1 shadow-xl backdrop-blur"
        >
          {address && (
            <button
              type="button"
              role="menuitem"
              onClick={async () => {
                await navigator.clipboard.writeText(address);
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-white/80 hover:bg-white/[0.05]"
            >
              <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={1.5} />
              <span className="truncate">Copy address</span>
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              logout();
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-white/80 hover:bg-white/[0.05]"
          >
            <HugeiconsIcon icon={Logout01Icon} size={14} strokeWidth={1.5} />
            <span>Disconnect</span>
          </button>
        </div>
      )}
    </div>
  );
}
