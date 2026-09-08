"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// A proportion, drawn. Not the Radix progress primitive: that one animates a
// translate on an indicator sized to the track, which is more machinery than a
// static figure on a server-rendered page needs. The ARIA is the part that
// matters and it is here.

function Progress({
  value,
  tone = "primary",
  className,
  ...props
}: React.ComponentProps<"div"> & {
  value: number | null;
  tone?: "primary" | "success" | "warning" | "destructive";
}) {
  const pct = Math.max(0, Math.min(100, value ?? 0));
  const fill = {
    primary: "bg-primary",
    success: "bg-success",
    warning: "bg-warning",
    destructive: "bg-destructive",
  }[tone];

  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuenow={value ?? 0}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("bg-muted relative h-2 w-full overflow-hidden rounded-pill border", className)}
      {...props}
    >
      <div
        data-slot="progress-indicator"
        className={cn("h-full rounded-pill transition-[width] duration-700 ease-out", fill)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export { Progress };
