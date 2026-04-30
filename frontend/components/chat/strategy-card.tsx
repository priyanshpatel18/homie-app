"use client";

import type { StrategyCard as StrategyCardData } from "@homie/sdk";

interface StrategyCardProps {
  card: StrategyCardData;
}

export function StrategyCard({ card }: StrategyCardProps) {
  const apy =
    typeof card.apy === "number" ? `${(card.apy * 100).toFixed(2)}%` : null;
  const tvl =
    typeof card.tvl === "number"
      ? `$${(card.tvl / 1_000_000).toFixed(1)}M`
      : null;
  const risk = typeof card.risk === "string" ? card.risk : null;

  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[14px] font-medium text-white/90">
          {card.protocol}
        </span>
        <span className="font-serif text-[13px] italic text-white/45">
          {card.action}
        </span>
      </div>

      {card.description ? (
        <p className="mt-2 text-[14px] leading-6 text-white/65">
          {card.description}
        </p>
      ) : null}

      {(apy ?? tvl ?? risk) ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            apy ? { label: "apy", value: apy } : null,
            tvl ? { label: "tvl", value: tvl } : null,
            risk ? { label: "risk", value: risk } : null,
          ]
            .filter(
              (m): m is { label: string; value: string } => m !== null
            )
            .map((m) => (
              <div
                key={m.label}
                className="rounded-xl border border-white/10 bg-black/30 px-2 py-2.5 text-center"
              >
                <div className="font-serif text-[12px] italic text-white/45">
                  {m.label}
                </div>
                <div className="mt-1 font-mono text-[14px] text-white">
                  {m.value}
                </div>
              </div>
            ))}
        </div>
      ) : null}
    </div>
  );
}
