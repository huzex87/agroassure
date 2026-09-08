import type { ReactNode } from "react";
import { ArrowUpRight, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "./card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table";

// The pieces this product needs that the shadcn registry does not ship: a page
// header, a figure tile, an empty state, and the two small text treatments the
// domain keeps asking for. Everything here is built out of the registry
// components rather than beside them, so a change to Card reaches all of it.

/* -------------------------------------------------------------------------
   Page furniture */

/**
 * Every page opened with the same hand-written header block. One component
 * means the size, the spacing and the place actions sit are the same on all of
 * them — which is most of what "finished" looks like from across a room.
 */
export function PageHeader({
  title,
  summary,
  actions,
}: {
  title: string;
  summary?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {summary && <div className="text-muted-foreground mt-1.5 text-sm">{summary}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

/* -------------------------------------------------------------------------
   Figures */

export type Tone = "neutral" | "primary" | "success" | "warning" | "destructive";

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-foreground",
  primary: "text-accent-foreground",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
};

const TONE_RULE: Record<Tone, string> = {
  neutral: "",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
};

/**
 * A single number and what it means.
 *
 * The label sits above the figure rather than below it: a reader scanning a row
 * of these needs to know what they are looking at before they read the value,
 * and a caption underneath makes them read it twice.
 */
export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
  href,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  /** When the figure is worth drilling into, the whole tile becomes the target. */
  href?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const body = (
    <>
      {/* A hairline of the tone along the top edge. It is the cheapest way to
          make a row of tiles scannable: the eye finds the figure that needs
          attention before it has read a single label. */}
      {tone !== "neutral" && (
        <span
          aria-hidden
          className={cn("absolute inset-x-0 top-0 h-[3px] rounded-t-card", TONE_RULE[tone])}
        />
      )}
      <div className="flex items-start justify-between gap-3">
        <p className="text-muted-foreground text-[0.8125rem] font-medium">{label}</p>
        {Icon ? (
          <Icon className="text-muted-foreground/60 size-4 shrink-0" />
        ) : href ? (
          <ArrowUpRight className="text-border size-4 shrink-0 transition-colors group-hover:text-primary" />
        ) : null}
      </div>
      <p className={cn("mt-2.5 text-[2rem] leading-none font-semibold tracking-tight tabular", TONE_TEXT[tone])}>
        {value}
      </p>
      {hint && <p className="text-muted-foreground mt-2.5 text-xs leading-relaxed">{hint}</p>}
    </>
  );

  const shell = cn(
    "group relative overflow-hidden px-4 py-4 transition-shadow",
    href && "hover:shadow-lifted",
  );

  // Not an <a> wrapping a block for style's sake: these tiles genuinely lead
  // somewhere, and a supervisor should not have to hunt for the small link.
  if (href) {
    return (
      <a href={href} className="contents">
        <Card className={shell}>{body}</Card>
      </a>
    );
  }
  return <Card className={shell}>{body}</Card>;
}

/* -------------------------------------------------------------------------
   Nothing to show */

/**
 * An empty state is the first thing most people see on a new deployment, and a
 * bare line of grey text reads as a page that failed rather than a page with
 * nothing in it yet.
 */
export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
      <span
        aria-hidden
        className="bg-muted text-muted-foreground grid size-9 place-items-center rounded-full border"
      >
        <Inbox className="size-4" />
      </span>
      <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">{children}</p>
      {action}
    </div>
  );
}

/** A machine's suggestion, shown with the reason that produced it. */
export function Reason({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground mt-0.5 text-sm leading-relaxed">
      <span className="sr-only">Reason: </span>
      {children}
    </p>
  );
}

/** A reference a person may read aloud or type back: a licence, a hash, an id. */
export function Ref({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground font-mono text-[0.8125rem] tracking-tight">{children}</span>;
}

/* -------------------------------------------------------------------------
   Convenience wrappers over the registry components

   shadcn's Card and Table are compositional, which is right for a one-off
   layout and wrong for the fifteenth list page that wants exactly the same
   title, subtitle and column treatment as the other fourteen. These wrap the
   registry components rather than replacing them: reach for Card, CardHeader
   and Table directly whenever a screen needs something these do not do. */

export function Panel({
  title,
  subtitle,
  actions,
  children,
  footer,
  flush = false,
  className = "",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Let the content reach the card's edges — for tables, which bring their own padding. */
  flush?: boolean;
  className?: string;
}) {
  const hasHead = Boolean(title || actions);
  return (
    <Card className={cn("overflow-hidden", className)}>
      {hasHead && (
        <CardHeader className={flush ? "pb-4" : undefined}>
          {title && <CardTitle>{title}</CardTitle>}
          {subtitle && <CardDescription>{subtitle}</CardDescription>}
          {actions && <CardAction>{actions}</CardAction>}
        </CardHeader>
      )}
      <div className={flush ? "min-w-0 flex-1" : cn("min-w-0 flex-1 px-5 pb-5", hasHead ? "pt-4" : "pt-5")}>
        {children}
      </div>
      {footer && <CardFooter>{footer}</CardFooter>}
    </Card>
  );
}

/** A table whose columns are the same shape on every list page in the console. */
export function DataTable({
  head,
  children,
  empty,
  align = [],
}: {
  head: ReactNode[];
  children: ReactNode;
  empty?: ReactNode;
  /** Columns whose numbers should sit right, so digits line up down the page. */
  align?: Array<"left" | "right">;
}) {
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {head.map((cell, i) => (
              <TableHead key={i} className={align[i] === "right" ? "text-right" : undefined}>
                {cell}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
      {empty}
    </>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <TableRow>{children}</TableRow>;
}

export function Cell({
  children,
  className = "",
  align = "left",
}: {
  children: ReactNode;
  className?: string;
  align?: "left" | "right";
}) {
  return (
    <TableCell className={cn(align === "right" && "text-right", className)}>{children}</TableCell>
  );
}
