import { Mail01Icon, NewTwitterIcon, TelegramIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Image from "next/image";
import Link from "next/link";

import { AskHomiePreview } from "@/components/ask-homie-preview";
import { FooterSubscribe } from "@/components/footer-subscribe";
import { SectionFade } from "@/components/section-fade";
import { StackBento } from "@/components/stack-bento";
import { FancyButton } from "@/components/ui/fancy-button";
import { HeroShader } from "@/components/ui/hero-shader";

const PRINCIPLES = [
  { idx: "01", label: "Learn", text: "Every move explained in plain words." },
  { idx: "02", label: "Practice", text: "Simulate before anything is signed." },
  { idx: "03", label: "Invest", text: "Execute when the picture is clear." },
];

export default function Home() {
  return (
    <div className="relative isolate flex min-h-dvh flex-1 flex-col overflow-hidden bg-[#040405] text-[#f4f4f0] selection:bg-[#00F666] selection:text-black">
      <HeroShader />

      <header className="relative z-10">
        <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between px-5 py-5 sm:px-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F666] focus-visible:ring-offset-2 focus-visible:ring-offset-[#040405]"
            aria-label="HeyHomieAI home"
          >
            <span className="relative inline-block size-6">
              <Image
                src="/homie/mainlogo.svg"
                alt=""
                fill
                priority
                className="object-contain"
              />
            </span>
            <span className="text-sm font-medium tracking-tight text-white/90">
              HeyHomieAI
            </span>
          </Link>

          <nav aria-label="Primary" className="flex items-center">
            <a
              href="https://x.com/HeyHomieAI"
              target="_blank"
              rel="noreferrer"
              className="hh-link text-sm text-white/75 hover:text-white"
            >
              @HeyHomieAI
            </a>
          </nav>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-[1280px] px-5 sm:px-8">
        <section
          aria-labelledby="hero-title"
          className="relative grid min-h-[calc(100dvh-160px)] grid-cols-12 items-center gap-y-12 py-14 sm:py-20"
        >
          <div className="relative col-span-12 lg:col-span-7">
            <p
              className="hh-reveal font-serif text-[clamp(1rem,2.2vw,1.15rem)] italic leading-relaxed text-white/45"
              style={{ animationDelay: "40ms" }}
            >
              — a companion, not a dashboard.
            </p>

            <h1
              id="hero-title"
              className="hh-reveal mt-6 text-[clamp(2.75rem,8.5vw,6.5rem)] font-medium leading-[0.94] tracking-[-0.035em]"
              style={{ animationDelay: "120ms" }}
            >
              <span className="font-sans">Learn while</span>
              <br />
              <span className="font-serif italic text-white/88">you </span>
              <span className="relative inline-block font-serif italic text-[#00F666]">
                invest
                <svg
                  aria-hidden
                  className="pointer-events-none absolute -bottom-1 left-0 h-2.5 w-[calc(100%+6px)] -translate-x-1 overflow-visible"
                  viewBox="0 0 140 10"
                  preserveAspectRatio="none"
                >
                  <path
                    d="M2 6 C 35 1, 70 9, 105 4 S 130 7, 138 5"
                    fill="none"
                    stroke="rgba(0,246,102,0.72)"
                    strokeWidth="2.25"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <span className="font-sans">.</span>
            </h1>

            <p
              className="hh-reveal mt-8 max-w-md text-[15px] leading-7 text-white/65 sm:text-base"
              style={{ animationDelay: "220ms" }}
            >
              HeyHomieAI is the crypto-savvy friend in your pocket. We explain
              the move, simulate the outcome, and only then help you act.
            </p>

            <div
              className="hh-reveal mt-10 flex flex-wrap items-center gap-x-6 gap-y-3"
              style={{ animationDelay: "300ms" }}
            >
              <FancyButton.Link href="/chat" variant="primary" className="group">
                Ask Homie
                <span
                  aria-hidden
                  className="inline-block translate-x-0 transition-transform duration-300 ease-out group-hover:translate-x-0.5"
                >
                  →
                </span>
              </FancyButton.Link>
              <a
                href="https://x.com/HeyHomieAI"
                target="_blank"
                rel="noreferrer"
                className="hh-link text-sm text-white/70 hover:text-white"
              >
                Follow us on X
              </a>
            </div>
          </div>

          <div
            aria-hidden
            className="relative col-span-12 flex items-center justify-center lg:col-span-5"
          >
            <div className="hh-float relative aspect-square w-[78%] max-w-[520px] lg:w-full">
              <div className="absolute inset-0 rounded-[50%] bg-[rgba(0,246,102,0.055)] blur-3xl" />
              <Image
                src="/homie/mainlogo.svg"
                alt=""
                fill
                priority
                className="hh-breathe object-contain"
              />
            </div>
          </div>
        </section>

        <SectionFade
          id="ethos"
          aria-labelledby="ethos-title"
          className="relative grid grid-cols-12 gap-x-6 gap-y-14 py-24 sm:py-32"
        >
          <div className="col-span-12 lg:col-span-4">
            <p className="font-serif text-[17px] italic text-white/50">
              Ethos
            </p>
            <h2
              id="ethos-title"
              className="mt-4 text-[clamp(1.9rem,4.2vw,3rem)] font-medium leading-[1.05] tracking-[-0.02em]"
            >
              Investing is a skill.
              <br />
              <span className="text-white/55">We teach it live.</span>
            </h2>
          </div>

          <div className="relative col-span-12 lg:col-span-8">
            <div
              aria-hidden
              className="absolute left-0 top-3 bottom-3 hidden w-px sm:block hh-rail"
            />
            <ol className="sm:pl-8">
              {PRINCIPLES.map((p, i) => (
                <li
                  key={p.idx}
                  className="grid grid-cols-12 items-baseline gap-x-6 py-10 first:pt-0 last:pb-0"
                  style={{ transitionDelay: `${i * 40}ms` }}
                >
                  <span className="col-span-2 font-serif text-[clamp(1.75rem,3.5vw,2.65rem)] italic leading-none text-white/30 sm:col-span-2">
                    {p.idx}
                  </span>
                  <span className="col-span-10 text-[clamp(1.1rem,2vw,1.25rem)] font-medium tracking-tight text-white sm:col-span-3">
                    {p.label}
                  </span>
                  <span className="col-span-12 mt-2 text-[15px] leading-7 text-white/65 sm:col-span-7 sm:mt-0">
                    {p.text}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </SectionFade>

        <SectionFade
          id="ask"
          aria-labelledby="ask-title"
          className="relative grid grid-cols-12 gap-x-6 gap-y-10 py-24 sm:py-32"
        >
          <div className="col-span-12 lg:col-span-5">
            <p className="font-serif text-[17px] italic text-white/50">
              Ask Homie
            </p>
            <h2
              id="ask-title"
              className="mt-4 text-[clamp(1.9rem,4.2vw,3rem)] font-medium leading-[1.05] tracking-[-0.02em]"
            >
              Plain questions.
              <br />
              <span className="text-white/55">Honest answers.</span>
            </h2>
            <p className="mt-6 max-w-sm text-[15px] leading-7 text-white/60">
              No jargon-first UX. No pretending everything is simple. Homie
              shows the mechanics, the risk, and the why, before you ever sign.
            </p>

            <div className="mt-7">
              <FancyButton.Link href="/chat" size="sm">
                Try it
              </FancyButton.Link>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-7">
            <AskHomiePreview />
          </div>
        </SectionFade>

        <SectionFade
          id="stack"
          aria-labelledby="stack-heading"
          className="py-6 sm:py-8"
        >
          <StackBento />
        </SectionFade>

        <SectionFade
          aria-label="Belief"
          className="relative py-24 sm:py-32"
        >
          <p className="mx-auto max-w-5xl text-balance text-[clamp(1.6rem,3.8vw,2.6rem)] font-medium leading-[1.2] tracking-[-0.015em] text-white/90">
            <span className="font-serif italic">
              &quot;Most people don&apos;t lose money in crypto because it&apos;s
              hard. They lose it because nobody{" "}
              <span className="hh-underline-static">explained</span>{" "}what was
              actually happening.&quot;
            </span>
            <span className="ml-3 font-serif text-[0.55em] not-italic text-white/35">
              — HeyHomieAI
            </span>
          </p>
        </SectionFade>
      </main>

      <footer className="relative z-10 mt-auto">
        <div className="mx-auto w-full max-w-[1280px] px-5 pt-14 sm:px-8 sm:pt-16">
          <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            <div>
              <div className="flex items-center gap-2">
                <span className="relative inline-block size-5">
                  <Image
                    src="/homie/mainlogo.svg"
                    alt=""
                    fill
                    className="object-contain"
                  />
                </span>
                <span className="text-sm font-medium text-white/90">
                  HeyHomieAI
                </span>
              </div>
              <p className="mt-3 max-w-xs text-sm leading-6 text-white/50">
                Learn while you invest. A calmer way to be on-chain.
              </p>
            </div>

            <div>
              <h3 className="font-serif text-[15px] italic text-white/45">
                Product
              </h3>
              <ul className="mt-4 space-y-2.5 text-sm text-white/75">
                <li>
                  <Link href="#ethos" className="hh-link hover:text-white">
                    Ethos
                  </Link>
                </li>
                <li>
                  <Link href="#ask" className="hh-link hover:text-white">
                    Ask Homie
                  </Link>
                </li>
                <li>
                  <Link href="#stack" className="hh-link hover:text-white">
                    Stack
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-serif text-[15px] italic text-white/45">
                Resources
              </h3>
              <ul className="mt-4 space-y-2.5 text-sm text-white/75">
                <li>
                  <a
                    href="https://x.com/HeyHomieAI"
                    target="_blank"
                    rel="noreferrer"
                    className="hh-link hover:text-white"
                  >
                    X / Twitter
                  </a>
                </li>
                <li>
                  <a
                    href="https://t.me/HeyHomieAI"
                    target="_blank"
                    rel="noreferrer"
                    className="hh-link hover:text-white"
                  >
                    Telegram
                  </a>
                </li>
                <li>
                  <a
                    href="mailto:hello@heyhomie.fun"
                    className="hh-link hover:text-white"
                  >
                    Email
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-serif text-[15px] italic text-white/45">
                Stay in the loop
              </h3>
              <FooterSubscribe />
            </div>
          </div>

          <div className="relative mt-14 overflow-hidden border-t border-white/10 pt-8">
            <p className="text-center text-xs text-white/45">
              © {new Date().getFullYear()} HeyHomieAI · All rights reserved.
            </p>

            <div className="mt-4 flex items-center justify-center gap-1">
              <Link
                href="https://x.com/HeyHomieAI"
                target="_blank"
                rel="noreferrer"
                aria-label="Follow HeyHomieAI on X"
                className="inline-flex size-10 items-center justify-center rounded-full text-white/65 transition-colors hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F666] focus-visible:ring-offset-2 focus-visible:ring-offset-[#040405]"
              >
                <HugeiconsIcon
                  icon={NewTwitterIcon}
                  size={18}
                  strokeWidth={1.9}
                  aria-hidden
                />
              </Link>
              <Link
                href="https://t.me/HeyHomieAI"
                target="_blank"
                rel="noreferrer"
                aria-label="Join HeyHomieAI on Telegram"
                className="inline-flex size-10 items-center justify-center rounded-full text-white/65 transition-colors hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F666] focus-visible:ring-offset-2 focus-visible:ring-offset-[#040405]"
              >
                <HugeiconsIcon
                  icon={TelegramIcon}
                  size={18}
                  strokeWidth={1.9}
                  aria-hidden
                />
              </Link>
              <a
                href="mailto:hello@heyhomie.fun"
                aria-label="Email HeyHomieAI"
                className="inline-flex size-10 items-center justify-center rounded-full text-white/65 transition-colors hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F666] focus-visible:ring-offset-2 focus-visible:ring-offset-[#040405]"
              >
                <HugeiconsIcon
                  icon={Mail01Icon}
                  size={18}
                  strokeWidth={1.9}
                  aria-hidden
                />
              </a>
            </div>

            <div className="relative h-[clamp(6.5rem,18vw,12.5rem)] w-full">
              <div
                aria-hidden
                className="pointer-events-none absolute left-1/2 bottom-[-0.45em] -translate-x-1/2 select-none whitespace-nowrap font-sans font-bold text-transparent opacity-95 [text-stroke:1px_rgba(244,244,240,0.13)] [-webkit-text-stroke:1px_rgba(244,244,240,0.13)]"
                style={{
                  fontSize: "clamp(5.25rem, 18vw, 12.5rem)",
                  lineHeight: 1.4,
                }}
              >
                heyhomie
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
