"use client";

import {
  chatStream,
  type AgentResponse,
  type ChatMessage as SdkChatMessage,
  type StrategyCard as StrategyCardData,
  type TradeMode,
} from "@homie/sdk";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";

import { Composer } from "./composer";
import { ConnectButton } from "./connect-button";
import { MessageBubble, ThinkingBubble } from "./message-bubble";
import { QuickActions } from "./quick-actions";
import { StrategyCard } from "./strategy-card";
import { ensureHomieInit } from "@/lib/homie";

interface UiMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  strategyCards?: StrategyCardData[];
  fallback?: boolean;
  error?: string;
}

const EASE: [number, number, number, number] = [0.22, 0.61, 0.36, 1];

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function summariseAgentResponse(res: AgentResponse): string {
  if (typeof res.text === "string" && res.text.trim()) return res.text;
  return JSON.stringify(res, null, 2);
}

export function ChatView() {
  const [messages, setMessages] = React.useState<UiMessage[]>([]);
  const [statusText, setStatusText] = React.useState<string>("");
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [mode, setMode] = React.useState<TradeMode>("ask");
  const [composerSeed, setComposerSeed] = React.useState<string | undefined>();
  const [composerNonce, setComposerNonce] = React.useState(0);
  const abortRef = React.useRef<AbortController | null>(null);
  const scrollAnchorRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    ensureHomieInit();
  }, []);

  React.useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, statusText, isStreaming]);

  const conversationHistory: SdkChatMessage[] = React.useMemo(
    () =>
      messages
        .filter((m) => !m.error)
        .map((m) => ({ role: m.role, content: m.text })),
    [messages]
  );

  function abort() {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    setStatusText("");
  }

  async function send(message: string) {
    if (isStreaming) return;

    setMessages((prev) => [
      ...prev,
      { id: makeId(), role: "user", text: message },
    ]);
    setIsStreaming(true);
    setStatusText("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await chatStream(
        {
          message,
          conversationHistory,
          wallet: { tradeMode: mode },
        },
        {
          onStatus: (text) => setStatusText(text),
        },
        controller.signal
      );

      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          role: "assistant",
          text: summariseAgentResponse(res),
          strategyCards: res.strategyCards,
          fallback: res.fallback,
        },
      ]);
    } catch (err) {
      if (controller.signal.aborted) return;
      const text = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          role: "assistant",
          text: "Something broke on my end. Try again in a sec.",
          error: text,
        },
      ]);
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
      setStatusText("");
    }
  }

  function pickQuickAction(prompt: string) {
    setComposerSeed(prompt);
    setComposerNonce((n) => n + 1);
  }

  const isEmpty = messages.length === 0 && !isStreaming;

  return (
    <div className="relative z-10 flex min-h-dvh flex-col">
      <div className="sticky top-0 z-20 flex items-center justify-end gap-3 px-5 pt-4 sm:px-8">
        <ConnectButton variant="primary" />
      </div>

      {isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center px-5 pb-12 pt-20 sm:px-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            className="w-full max-w-[720px]"
          >
            <h1 className="text-center text-[clamp(2rem,5vw,3.4rem)] font-medium leading-[1.05] tracking-[-0.02em] text-white">
              Ask Homie{" "}
              <span className="font-serif italic text-white/85">anything</span>
              <span className="text-[#00F666]">.</span>
            </h1>
            <p className="mt-4 text-center font-serif text-[15px] italic text-white/45">
              Plain questions. Honest answers.
            </p>

            <div className="mt-9">
              <Composer
                variant="hero"
                onSubmit={send}
                onAbort={abort}
                isStreaming={isStreaming}
                mode={mode}
                onModeChange={setMode}
                initialValue={composerSeed}
                resetKey={composerNonce}
              />
            </div>

            <div className="mt-6">
              <QuickActions onPick={pickQuickAction} disabled={isStreaming} />
            </div>
          </motion.div>
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-[860px] flex-1 flex-col px-5 pt-10 sm:px-8">
          <div className="flex-1 space-y-4 overflow-y-auto pb-6">
            <AnimatePresence initial={false} mode="popLayout">
              {messages.map((m) => (
                <motion.div key={m.id} layout className="space-y-3">
                  <MessageBubble variant={m.role}>{m.text}</MessageBubble>

                  {m.strategyCards && m.strategyCards.length > 0 ? (
                    <div className="ml-10 grid gap-3 sm:grid-cols-2">
                      {m.strategyCards.map((card, i) => (
                        <StrategyCard key={i} card={card} />
                      ))}
                    </div>
                  ) : null}

                  {m.fallback ? (
                    <p className="ml-10 font-serif text-[13px] italic text-white/40">
                      Used the simpler brain for this response.
                    </p>
                  ) : null}

                  {m.error ? (
                    <p className="ml-10 font-mono text-[12px] text-white/35">
                      {m.error}
                    </p>
                  ) : null}
                </motion.div>
              ))}

              {isStreaming ? (
                <motion.div key="thinking" layout>
                  <ThinkingBubble status={statusText} />
                </motion.div>
              ) : null}
            </AnimatePresence>

            <div ref={scrollAnchorRef} />
          </div>

          <div className="sticky bottom-0 -mx-5 bg-gradient-to-t from-[#040405] via-[#040405]/95 to-transparent px-5 pb-6 pt-3 sm:-mx-8 sm:px-8">
            <Composer
              variant="compact"
              onSubmit={send}
              onAbort={abort}
              isStreaming={isStreaming}
              mode={mode}
              onModeChange={setMode}
              initialValue={composerSeed}
              resetKey={composerNonce}
            />
          </div>
        </div>
      )}
    </div>
  );
}
