import type { ReactNode } from "react";
import { ArrowUpRight, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "./card";
import { Spark } from "./spark";
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
  eyebrow,
}: {
  title: string;
  summary?: ReactNode;
  actions?: ReactNode;
  /** A line above the title: where this sits, or what day it is. */
  eyebrow?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-primary-700 mb-1.5 text-xs font-semibold tracking-[0.08em] uppercase">{eyebrow}</p>
        )}
        <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight">{title}</h1>
        {summary && <div className="text-muted-foreground mt-1.5 max-w-2xl text-sm leading-relaxed">{summary}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
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

const TONE_CHIP: Record<Tone, string> = {
  neutral: "bg-primary-50 text-primary-700 ring-primary-100",
  primary: "bg-primary-50 text-primary-700 ring-primary-100",
  success: "bg-success-muted text-success ring-success-border",
  warning: "bg-warning-muted text-warning ring-warning-border",
  destructive: "bg-destructive-muted text-destructive ring-destructive-border",
};

const TONE_STROKE: Record<Tone, string> = {
  neutral: "var(--primary)",
  primary: "var(--primary)",
  success: "var(--success)",
  warning: "var(--warning)",
  destructive: "var(--destructive)",
};

/**
 * A single number and what it means.
 *
 * The label sits above the figure rather than below it: a reader scanning a row
 * of these needs to know what they are looking at before they read the value,
 * and a caption underneath makes them read it twice. The chip beside the label
 * takes the tone, so the figure that needs attention is found by colour before
 * a single word is read, and the word is still there for anyone who cannot see
 * the colour.
 */
export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
  href,
  icon: Icon,
  trend,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  /** When the figure is worth drilling into, the whole tile becomes the target. */
  href?: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** Recent readings, oldest first, drawn as a small line under the figure. */
  trend?: number[];
}) {
  const body = (
    <>
      {/* The label row holds two lines whether or not the label needs them, so
          the figures in a row of tiles sit on the same line. */}
      <div className="flex min-h-9 items-start gap-2.5">
        {Icon ? (
          <span
            aria-hidden
            className={cn("grid size-8 shrink-0 place-items-center rounded-[10px] ring-1 ring-inset", TONE_CHIP[tone])}
          >
            <Icon className="size-4" />
          </span>
        ) : null}
        <p className="text-muted-foreground min-w-0 flex-1 self-center text-[0.8125rem] leading-snug font-medium">{label}</p>
        {href ? (
          <ArrowUpRight className="text-border group-hover:text-primary size-4 shrink-0 transition-colors" aria-hidden />
        ) : null}
      </div>
      <div className="mt-3 flex h-9 items-end justify-between gap-3">
        <p className={cn("text-[1.875rem] leading-none font-semibold tracking-tight tabular", TONE_TEXT[tone])}>
          {value}
        </p>
        {trend && trend.length > 1 ? <Spark values={trend} stroke={TONE_STROKE[tone]} className="mb-0.5 -mr-1" /> : null}
      </div>
      {hint && <p className="text-muted-foreground mt-3 text-xs leading-relaxed">{hint}</p>}
    </>
  );

  const shell = cn(
    "group relative overflow-hidden px-4 py-4 transition-all",
    href && "hover:-translate-y-px hover:shadow-lifted",
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
