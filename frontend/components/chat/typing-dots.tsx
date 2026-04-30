"use client";

import { motion } from "motion/react";

interface TypingDotsProps {
  tone?: "ai" | "user";
}

export function TypingDots({ tone = "ai" }: TypingDotsProps) {
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
