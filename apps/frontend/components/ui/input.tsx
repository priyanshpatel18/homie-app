import * as React from "react";

import { cn } from "@/lib/utils";

function Root({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-root"
      className={cn("flex w-full flex-col gap-1.5", className)}
      {...props}
    />
  );
}

function Wrapper({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-wrapper"
      className={cn(
        "flex min-h-11 w-full items-center gap-2 rounded-full border border-white/12 bg-black/35 px-4 py-2 transition-colors",
        "has-[:focus-visible]:border-[#00F666]/45 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#00F666]/25",
        className
      )}
      {...props}
    />
  );
}

const InputField = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input">
>(function InputField({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      data-slot="input-input"
      className={cn(
        "min-w-0 flex-1 bg-transparent text-[14px] text-[#f4f4f0] outline-none placeholder:text-white/40",
        className
      )}
      {...props}
    />
  );
});

const Input = { Root, Wrapper, Input: InputField };

export { Input };
