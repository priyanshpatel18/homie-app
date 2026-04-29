"use client";

import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
} from "motion/react";
import Image from "next/image";
import * as React from "react";

import { FancyButton } from "@/components/ui/fancy-button";
import { Input } from "@/components/ui/input";

type Phase = "idle" | "userTyping" | "userSent" | "aiThinking" | "aiSent";

// State machine: each phase auto-advances after `delay` ms while the chat is
// in view. When it lands back on "idle", the loop restarts naturally.
const NEXT: Record<Phase, { next: Phase; delay: number }> = {
  idle: { next: "userTyping", delay: 700 },
  userTyping: { next: "userSent", delay: 1400 },
  userSent: { next: "aiThinking", delay: 650 },
  aiThinking: { next: "aiSent", delay: 1900 },
  aiSent: { next: "idle", delay: 5200 },
};

const EASE: [number, number, number, number] = [0.22, 0.61, 0.36, 1];

function TypingDots({ tone = "ai" }: { tone?: "ai" | "user" }) {
  const color = tone === "ai" ? "bg-[#00F666]/85" : "bg-white/55";
  return (
    <span className="inline-flex items-center gap-1.5 py-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className={`size-1.5 rounded-full ${color}`}
          animate={{ opacity: [0.28, 1, 0.28], y: [0, -2.5, 0] }}
          transition={{
            duration: 0.95,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.15,
          }}
        />
      ))}
    </span>
  );
}

export function AskHomiePreview() {
  const reduce = useReducedMotion();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(containerRef, {
    margin: "-15% 0px -15% 0px",
    once: false,
  });
  const [phase, setPhase] = React.useState<Phase>(reduce ? "aiSent" : "idle");

  React.useEffect(() => {
    if (reduce) return;
    if (!inView) return;
    const { next, delay } = NEXT[phase];
    const id = window.setTimeout(() => setPhase(next), delay);
    return () => window.clearTimeout(id);
  }, [phase, inView, reduce]);

  const showUserTyping = phase === "userTyping";
  const showUserBubble =
    phase === "userSent" || phase === "aiThinking" || phase === "aiSent";
  const showAiThinking = phase === "aiThinking";
  const showAiBubble = phase === "aiSent";

  return (
    <>
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] backdrop-blur-sm"
      >
        <div className="flex items-center justify-between px-5 py-3.5 text-sm text-white/55">
          <span>HeyHomie</span>
        </div>

        <div className="flex min-h-[440px] flex-col px-5 py-6 sm:min-h-[470px] sm:px-8 sm:py-8">
          <div className="flex-1 space-y-4">
            {/* User row */}
            <div className="flex min-h-[52px] justify-end">
            <AnimatePresence mode="popLayout" initial={false}>
              {showUserTyping ? (
                <motion.div
                  key="user-typing"
                  layout
                  initial={{ opacity: 0, y: 8, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.99 }}
                  transition={{ duration: 0.28, ease: EASE }}
                  className="rounded-2xl rounded-br-md bg-white/[0.04] px-4 py-3 ring-1 ring-white/5"
                  aria-label="You are typing"
                >
                  <TypingDots tone="user" />
                </motion.div>
              ) : null}
              {showUserBubble ? (
                <motion.p
                  key="user-msg"
                  layout
                  initial={{ opacity: 0, y: 8, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.99 }}
                  transition={{ duration: 0.34, ease: EASE }}
                  className="max-w-[85%] rounded-2xl rounded-br-md bg-white/[0.04] px-4 py-3 text-[15px] leading-7 text-white/85 ring-1 ring-white/5"
                >
                  I have 200 USDC. What&apos;s a safe way to earn yield?
                </motion.p>
              ) : null}
            </AnimatePresence>
          </div>

          {/* AI row */}
          <AnimatePresence mode="popLayout" initial={false}>
            {showAiThinking || showAiBubble ? (
              <motion.div
                key="ai-row"
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.32, ease: EASE }}
                className="flex items-start gap-3"
              >
                <span className="mt-1 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[#00F666]/10 ring-1 ring-[#00F666]/20">
                  <Image
                    src="/homie/mainlogo.svg"
                    alt=""
                    width={18}
                    height={18}
                    className="opacity-90"
                  />
                </span>

                <div className="min-w-0 flex-1">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {showAiThinking ? (
                      <motion.div
                        key="ai-thinking"
                        layout
                        initial={{ opacity: 0, y: 8, scale: 0.985 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.99 }}
                        transition={{ duration: 0.28, ease: EASE }}
                        className="inline-flex items-center gap-2 rounded-2xl rounded-bl-md bg-white/[0.04] px-4 py-3 ring-1 ring-white/5"
                        aria-label="Homie is thinking"
                      >
                        <TypingDots tone="ai" />
                        <span className="font-serif text-[13px] italic text-white/45">
                          Homie is thinking…
                        </span>
                      </motion.div>
                    ) : null}
                    {showAiBubble ? (
                      <motion.div
                        key="ai-msg"
                        layout
                        initial={{ opacity: 0, y: 8, scale: 0.985 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.99 }}
                        transition={{ duration: 0.42, ease: EASE }}
                        className="max-w-[85%] rounded-2xl rounded-bl-md bg-white/[0.04] px-4 py-3 text-[15px] leading-7 text-white/85 ring-1 ring-white/5"
                      >
                        <p>
                          Here&apos;s a conservative route: keep 20% as dry
                          powder, put 80% in a stablecoin vault with a clear
                          downside cap.
                        </p>
                        <motion.div
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            duration: 0.4,
                            ease: EASE,
                            delay: 0.18,
                          }}
                          className="mt-3 grid grid-cols-3 gap-2"
                        >
                          {[
                            { label: "est. apy", value: "4.8%" },
                            { label: "downside", value: "< 1%" },
                            { label: "lockup", value: "none" },
                          ].map((m) => (
                            <div
                              key={m.label}
                              className="rounded-xl border border-white/10 bg-black/25 px-2 py-2.5 text-center"
                            >
                              <div className="font-serif text-[13px] italic text-white/45">
                                {m.label}
                              </div>
                              <div className="mt-1 font-mono text-[15px] text-white">
                                {m.value}
                              </div>
                            </div>
                          ))}
                        </motion.div>
                        <motion.p
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            duration: 0.4,
                            ease: EASE,
                            delay: 0.32,
                          }}
                          className="mt-3 text-white/55"
                        >
                          Want me to simulate how $160 behaves over 90 days
                          before you commit?
                        </motion.p>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
          </div>

          {/* Composer (pinned to bottom of fixed-height card) */}
          <div className="flex items-end gap-3 pt-4">
            <Input.Root className="min-w-0 flex-1">
              <Input.Wrapper className="rounded-full py-1">
                <Input.Input
                  readOnly
                  placeholder="Ask something…"
                  aria-label="Message preview (illustrative)"
                  className="cursor-default"
                />
              </Input.Wrapper>
            </Input.Root>
            <FancyButton.Root
              type="button"
              size="sm"
              className="size-10 shrink-0 rounded-full p-0 hover:scale-[1.04]"
              aria-label="Send"
            >
              ↑
            </FancyButton.Root>
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-white/40">
        Illustrative preview, numbers are examples.
      </p>
    </>
  );
}
