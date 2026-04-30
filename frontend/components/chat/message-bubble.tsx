"use client";

import { motion } from "motion/react";
import Image from "next/image";
import * as React from "react";

import { TypingDots } from "./typing-dots";

const EASE: [number, number, number, number] = [0.22, 0.61, 0.36, 1];

type Variant = "user" | "assistant";

interface MessageBubbleProps {
  variant: Variant;
  children: React.ReactNode;
}

export function MessageBubble({ variant, children }: MessageBubbleProps) {
  if (variant === "user") {
    return (
      <div className="flex justify-end">
        <motion.div
          layout
          initial={{ opacity: 0, y: 8, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.34, ease: EASE }}
          className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-white/[0.04] px-4 py-3 text-[15px] leading-7 text-white/85 ring-1 ring-white/5"
        >
          {children}
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
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
        <motion.div
          layout
          initial={{ opacity: 0, y: 8, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.42, ease: EASE }}
          className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-white/[0.04] px-4 py-3 text-[15px] leading-7 text-white/85 ring-1 ring-white/5"
        >
          {children}
        </motion.div>
      </div>
    </motion.div>
  );
}

export function ThinkingBubble({ status }: { status?: string }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
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
        <motion.div
          layout
          initial={{ opacity: 0, y: 8, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.28, ease: EASE }}
          className="inline-flex items-center gap-2 rounded-2xl rounded-bl-md bg-white/[0.04] px-4 py-3 ring-1 ring-white/5"
          aria-label="Homie is thinking"
        >
          <TypingDots tone="ai" />
          <span className="font-serif text-[13px] italic text-white/45">
            {status?.trim() ? status : "Homie is thinking…"}
          </span>
        </motion.div>
      </div>
    </motion.div>
  );
}
