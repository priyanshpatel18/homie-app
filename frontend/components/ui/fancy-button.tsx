import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import * as React from "react";

import { cn } from "@/lib/utils";

const fancyButtonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-sm font-medium transition-all duration-200 outline-none select-none focus-visible:ring-2 focus-visible:ring-[#00F666]/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#040405] disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        primary:
          "bg-[#f4f4f0] text-[#0a0a0a] shadow-sm hover:bg-white active:scale-[0.99]",
        secondary:
          "border border-white/15 bg-white/[0.04] text-[#f4f4f0] hover:border-white/25 hover:bg-white/[0.07]",
      },
      size: {
        md: "h-11 px-6",
        sm: "h-9 px-4 text-[13px]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export type FancyButtonVariantProps = VariantProps<typeof fancyButtonVariants>;

function Root({
  className,
  variant,
  size,
  type = "button",
  ...props
}: React.ComponentProps<"button"> & FancyButtonVariantProps) {
  return (
    <button
      type={type}
      className={cn(fancyButtonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

function FancyLink({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof Link> & FancyButtonVariantProps) {
  return (
    <Link
      className={cn(fancyButtonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

const FancyButton = { Root, Link: FancyLink, fancyButtonVariants };

export { FancyButton, fancyButtonVariants };
