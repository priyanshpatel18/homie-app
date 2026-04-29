"use client";

import Image from "next/image";

import { BentoGrid } from "@/components/ui/bento-grid";
import { SpotlightCard } from "@/components/ui/spotlight";
import { cn } from "@/lib/utils";

const STACK = [
  {
    id: "jupiter",
    name: "Jupiter",
    logo: "/homie/jupiter.svg",
    tag: "swaps",
    body: "Best price, every time.",
    className: "md:col-span-3",
  },
  {
    id: "phantom",
    name: "Phantom",
    logo: "/homie/phantom.svg",
    tag: "wallet",
    body: "Sign with consent. Never without.",
    className: "md:col-span-3",
  },
  {
    id: "kamino",
    name: "Kamino",
    logo: "/homie/kamino.svg",
    tag: "yield",
    body: "Conservative vaults first.",
    className: "md:col-span-2",
  },
  {
    id: "meteora",
    name: "Meteora",
    logo: "/homie/meteora.svg",
    tag: "liquidity",
    body: "Concentrated liquidity, explained.",
    className: "md:col-span-2",
  },
  {
    id: "raydium",
    name: "Raydium",
    logo: "/homie/raydium.svg",
    tag: "pools",
    body: "Spot pools when they make sense.",
    className: "md:col-span-2",
  },
] as const;

export function StackBento() {
  return (
    <div className="relative py-24 sm:py-32">
      <div className="mb-12 max-w-2xl">
        <h2
          id="stack-heading"
          className="font-serif text-[17px] italic leading-snug text-white/55"
        >
          The stack, in plain English
        </h2>
        <p className="mt-3 text-[clamp(1.75rem,3.8vw,2.75rem)] font-medium leading-[1.08] tracking-[-0.02em] text-[#f4f4f0]">
          Built on protocols you already trust.
        </p>
      </div>

      <BentoGrid.Grid className="md:grid-cols-6">
        {STACK.map((item) => (
          <SpotlightCard
            key={item.id}
            className={cn("min-h-[140px] md:min-h-[170px]", item.className)}
          >
            <div className="mb-5 flex items-center justify-between gap-4">
              <Image
                src={item.logo}
                alt={`${item.name} logo`}
                width={320}
                height={36}
                className="hh-logo-mark h-6 w-auto sm:h-7"
                style={{ width: "auto" }}
              />
              <span className="font-serif text-[13px] italic text-white/45">
                {item.tag}
              </span>
            </div>
            <p className="mt-auto text-[15px] leading-relaxed text-white/70">
              {item.body}
            </p>
          </SpotlightCard>
        ))}
      </BentoGrid.Grid>
    </div>
  );
}
