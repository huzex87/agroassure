import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";

// The one button.
//
// Every button and every link that looks like one comes from here, so the
// height, the radius, the weight, the hover and the focus ring are decided once.
// Three sizes (32, 36, 40 px) sit level with the three field heights. Variants
// are the vocabulary: primary is the one thing to do on a screen, secondary is
// everything else, ghost is a quiet action inside a row, and the status
// variants speak the same colours as the badge beside them.
//
// For a link, wrap it: <Button asChild><Link href="…">Plan visits</Link></Button>.

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-control text-sm font-semibold whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] select-none outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 active:translate-y-px [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-raised hover:bg-primary-600",
        secondary:
          "border border-input bg-card text-foreground shadow-xs hover:border-primary-200 hover:bg-accent hover:text-accent-foreground",
        ghost: "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        destructive: "bg-destructive text-destructive-foreground shadow-raised hover:bg-destructive/90",
        success: "bg-success text-success-foreground shadow-raised hover:bg-success/90",
        warning: "bg-warning text-warning-foreground shadow-raised hover:bg-warning/90",
        // On a pine surface: gold is the one thing to do, glass is everything else.
        gold: "bg-millet text-pine shadow-raised hover:brightness-105",
        glass: "border border-white/25 bg-white/10 text-white hover:bg-white/15",
        link: "h-auto rounded-sm px-0 font-medium text-primary-700 underline-offset-4 hover:underline",
        // Kept so older call sites keep compiling; the same thing as secondary.
        outline:
          "border border-input bg-card text-foreground shadow-xs hover:border-primary-200 hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        sm: "h-8 px-3 text-[0.8125rem] has-[>svg]:px-2.5",
        default: "h-9 px-4 has-[>svg]:px-3",
        lg: "h-10 px-5 has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  children,
  disabled,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /** Shows a spinner and refuses clicks while work is in flight. */
    loading?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading ? <RotateCw className="animate-spin" aria-hidden /> : null}
          {children}
        </>
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
