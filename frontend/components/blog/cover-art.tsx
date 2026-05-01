import Image from "next/image";

import { cn } from "@/lib/utils";

type CoverArtProps = {
  title: string;
  category: string;
  accent: string;
  cover?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  priority?: boolean;
};

const SIZE_CLASS: Record<NonNullable<CoverArtProps["size"]>, string> = {
  sm: "aspect-[16/10]",
  md: "aspect-[16/10]",
  lg: "aspect-[16/10]",
};

const TITLE_CLASS: Record<NonNullable<CoverArtProps["size"]>, string> = {
  sm: "text-[clamp(1.05rem,2vw,1.45rem)]",
  md: "text-[clamp(1.4rem,2.6vw,2.1rem)]",
  lg: "text-[clamp(1.8rem,3.4vw,2.8rem)]",
};

export function CoverArt({
  title,
  category,
  accent,
  cover,
  size = "md",
  className,
  priority,
}: CoverArtProps) {
  return (
    <div
      className={cn(
        "relative isolate w-full overflow-hidden rounded-2xl border border-white/[0.06]",
        SIZE_CLASS[size],
        className
      )}
      style={{
        backgroundColor: "#0a0a0c",
      }}
    >
      {cover ? (
        <Image
          src={cover}
          alt=""
          fill
          priority={priority}
          sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 40vw"
          className="object-cover"
        />
      ) : (
        <GeneratedCover title={title} category={category} accent={accent} titleSizeClass={TITLE_CLASS[size]} />
      )}

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2"
        style={{
          background: `linear-gradient(180deg, transparent 0%, ${accent}14 75%, ${accent}26 100%)`,
        }}
      />
    </div>
  );
}

function GeneratedCover({
  title,
  category,
  accent,
  titleSizeClass,
}: {
  title: string;
  category: string;
  accent: string;
  titleSizeClass: string;
}) {
  return (
    <div className="absolute inset-0">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 18% 12%, rgba(255,255,255,0.06), transparent 55%)," +
            "radial-gradient(140% 110% at 82% 100%, " +
            accent +
            "26 0%, transparent 55%)," +
            "linear-gradient(180deg, #0d0d10 0%, #050507 100%)",
        }}
      />

      <svg
        aria-hidden
        className="absolute inset-0 h-full w-full opacity-[0.07]"
        viewBox="0 0 600 380"
        preserveAspectRatio="none"
      >
        <defs>
          <pattern id="hh-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.6" />
          </pattern>
        </defs>
        <rect width="600" height="380" fill="url(#hh-grid)" />
      </svg>

      <div className="relative z-10 flex h-full flex-col justify-between p-5 sm:p-7">
        <div className="flex items-center gap-2.5">
          <span className="relative inline-block size-5">
            <Image
              src="/homie/mainlogo.svg"
              alt=""
              fill
              className="object-contain"
            />
          </span>
          <span
            className="font-mono text-[10px] uppercase tracking-[0.18em]"
            style={{ color: accent }}
          >
            {category}
          </span>
        </div>

        <div>
          <h3
            className={cn(
              "font-serif italic leading-[1.05] tracking-[-0.01em] text-white/90",
              titleSizeClass
            )}
          >
            {title}
          </h3>
          <div
            aria-hidden
            className="mt-3 h-px w-12"
            style={{ backgroundColor: accent, opacity: 0.7 }}
          />
        </div>
      </div>
    </div>
  );
}
