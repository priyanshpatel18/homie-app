interface AmbientGridProps {
  className?: string;
}

export function AmbientGrid({ className }: AmbientGridProps) {
  return (
    <div
      aria-hidden
      className={[
        "pointer-events-none absolute inset-0 -z-0 overflow-hidden",
        className ?? "",
      ].join(" ")}
    >
      <div
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(244,244,240,0.12) 1px, transparent 0)",
          backgroundSize: "28px 28px",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, rgba(0,246,102,0.06), transparent 70%)",
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-[40%]"
        style={{
          background:
            "linear-gradient(180deg, transparent, rgba(4,4,5,0.85))",
        }}
      />
    </div>
  );
}
