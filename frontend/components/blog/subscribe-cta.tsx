"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";

export function SubscribeCta() {
  return (
    <section
      aria-labelledby="subscribe-heading"
      className="mx-auto w-full max-w-[1280px] px-5 pt-20 pb-20 sm:px-8 sm:pt-24 sm:pb-24"
    >
      <div className="relative isolate overflow-hidden rounded-3xl border border-white/[0.07] bg-[#0a0a0c]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(80% 100% at 0% 0%, rgba(0,246,102,0.08) 0%, transparent 60%)",
          }}
        />

        <div className="grid grid-cols-12 gap-y-8 gap-x-8 p-6 sm:p-10 lg:p-12">
          <div className="col-span-12 flex flex-col justify-center lg:col-span-6">
            <span className="relative inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/[0.08] bg-white/[0.04]">
              <Image
                src="/homie/mainlogo.svg"
                alt=""
                width={20}
                height={20}
                className="object-contain"
              />
            </span>

            <h2
              id="subscribe-heading"
              className="mt-6 text-[clamp(1.85rem,3.6vw,2.6rem)] font-medium leading-[1.05] tracking-[-0.02em] text-white"
            >
              Subscribe to <span className="font-serif italic">HeyHomieAI</span>
            </h2>
            <p className="mt-4 max-w-md text-[15px] leading-7 text-white/60">
              Field notes from building Homie. New posts and product updates
              the day they ship. No spam, ever.
            </p>
          </div>

          <div className="col-span-12 flex items-center lg:col-span-6">
            <SubscribeForm />
          </div>
        </div>
      </div>
    </section>
  );
}

function SubscribeForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">(
    "idle"
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email) return;
    setStatus("submitting");
    try {
      await new Promise((r) => setTimeout(r, 400));
      setStatus("ok");
      setEmail("");
    } catch {
      setStatus("error");
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5 sm:p-6"
    >
      <label
        htmlFor="subscribe-email"
        className="block font-mono text-[10px] uppercase tracking-[0.18em] text-white/45"
      >
        Email address
      </label>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          id="subscribe-email"
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11 w-full flex-1 rounded-full border border-white/[0.1] bg-[#040405] px-4 text-sm text-white placeholder:text-white/35 outline-none transition-colors focus:border-[#00F666]/50 focus:bg-black"
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className="h-11 shrink-0 rounded-full bg-[#00F666] px-6 text-sm font-medium text-[#040405] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F666] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0c] disabled:opacity-60"
        >
          {status === "submitting" ? "Sending…" : "Subscribe"}
        </button>
      </div>

      <p
        className="mt-3 min-h-[1.25rem] text-xs text-white/45"
        aria-live="polite"
      >
        {status === "ok" && (
          <span className="text-[#00F666]">
            You&apos;re on the list. Talk soon.
          </span>
        )}
        {status === "error" && (
          <span className="text-red-400">
            Something went wrong. Try again in a moment.
          </span>
        )}
        {status === "idle" && (
          <span>By subscribing you agree to receive occasional emails.</span>
        )}
        {status === "submitting" && <span>Adding you to the list…</span>}
      </p>
    </form>
  );
}
