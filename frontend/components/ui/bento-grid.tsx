import * as React from "react";

import { cn } from "@/lib/utils";

function Grid({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 md:grid-cols-4 md:auto-rows-fr",
        className
      )}
      {...props}
    />
  );
}

const BentoGrid = { Grid };

export { BentoGrid };
