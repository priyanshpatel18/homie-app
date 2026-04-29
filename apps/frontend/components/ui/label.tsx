import * as React from "react";

import { cn } from "@/lib/utils";

/** AlignUI-style label — Inter, sentence case, no mono tracking */
function Root({
  className,
  ...props
}: React.ComponentProps<"label">) {
  return (
    <label
      className={cn(
        "text-[13px] font-medium leading-none text-white/70",
        className
      )}
      {...props}
    />
  );
}

const Label = { Root };

export { Label };
