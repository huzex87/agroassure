import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// shadcn/ui badge, carrying this product's status vocabulary as variants.
//
// Status always carries a word, never a colour alone: the registry has to stay
// readable to a colour-blind reader and in a printed export, so the label is
// the signal and the tint is a second channel that helps a sighted reader scan
// a column.

const badgeVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 [&>svg]:pointer-events-none transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-border bg-muted text-muted-foreground",
        outline: "border-input text-foreground",
        accent: "border-primary-200 bg-accent text-accent-foreground",
        success: "border-success-border bg-success-muted text-success",
        warning: "border-warning-border bg-warning-muted text-warning",
        destructive: "border-destructive-border bg-destructive-muted text-destructive",
      },
    },
    defaultVariants: { variant: "secondary" },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  dot = false,
  children,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean; dot?: boolean }) {
  const Comp = asChild ? Slot : "span";
  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props}>
      {/* A leading dot for tables, where the eye tracks a column of shapes
          before it reads any of the words. */}
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </Comp>
  );
}

export { Badge, badgeVariants };
