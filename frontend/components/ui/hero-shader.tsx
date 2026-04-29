"use client";

import { MeshGradient } from "@paper-design/shaders-react";
import { useSyncExternalStore } from "react";

function subscribeReducedMotion(onStoreChange: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getReducedMotionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getReducedMotionServerSnapshot() {
  return false;
}

/**
 * Ambient background from Paper Shaders (same family as 21st.dev agents).
 * Falls back to a static CSS gradient when the user prefers reduced motion.
 */
export function HeroShader() {
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot
  );

  if (reducedMotion) {
    return (
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_120%_80%_at_50%_-18%,rgba(0,246,102,0.07),transparent_52%),radial-gradient(ellipse_85%_55%_at_100%_100%,rgba(6,22,18,0.78),transparent_48%),#040405]"
      />
    );
  }

  return (
    <div aria-hidden className="absolute inset-0 -z-10">
      <MeshGradient
        className="size-full min-h-[100dvh] opacity-[0.84]"
        colors={["#010102", "#050806", "#0c1714", "#12a06e"]}
        distortion={0.6}
        swirl={0.068}
        speed={0.125}
        grainMixer={0.052}
        grainOverlay={0.058}
      />
    </div>
  );
}
