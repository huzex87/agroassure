import type { ReactNode } from "react";

// The primitives this console is built from.
//
// ponytail: the stack names shadcn/ui, which is a generator that copies dozens
// of components into the repo. What these screens actually use is here instead.
// Reach for the generator when the component count justifies it, not before.

/* -------------------------------------------------------------------------
   Page furniture */

/**
 * Every page opened with the same hand-written header block. One component
 * means the spacing, the size and the place actions sit are the same on all of
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
        <h1 className="text-2xl font-semibold text-ink">{title}</h1>
        {summary && <div className="mt-1.5 text-sm text-ink-muted">{summary}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A dotted list of counts under a page title: "12 shown · 3 past due". */
export function Facts({ items }: { items: Array<{ label: string; tone?: Tone } | null> }) {
  const shown = items.filter((i): i is { label: string; tone?: Tone } => i !== null);
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {shown.map((item, i) => (
        <span key={item.label} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden className="text-line-firm">·</span>}
          <span className={item.tone ? TONE_TEXT[item.tone] : undefined}>{item.label}</span>
        </span>
      ))}
    </p>
  );
}

/* -------------------------------------------------------------------------
   Surfaces */

export function Card({
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
    <section className={`card flex flex-col overflow-hidden ${className}`}>
      {hasHead && (
        <header
          className={`flex items-start justify-between gap-4 px-5 pt-5 ${flush ? "pb-4" : "pb-0"}`}
        >
          <div className="min-w-0">
            {title && <h2 className="text-[0.9375rem] font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-1 text-sm leading-relaxed text-ink-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={flush ? "min-w-0 flex-1" : `min-w-0 flex-1 px-5 ${hasHead ? "pt-4" : "pt-5"} pb-5`}>
        {children}
      </div>
      {footer && (
        <footer className="border-t border-line bg-surface-sunk px-5 py-3 text-xs text-ink-muted">
          {footer}
        </footer>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------
   Figures */

type Tone = "neutral" | "good" | "caution" | "critical" | "primary";

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-ink",
  primary: "text-primary-700",
  good: "text-good",
  caution: "text-caution",
  critical: "text-critical",
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
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  /** When the figure is worth drilling into, the whole tile becomes the target. */
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.8125rem] font-medium text-ink-muted">{label}</p>
        {href && (
          // A quiet mark that this tile goes somewhere, which sharpens on hover
          // rather than shouting for attention while you are reading the number.
          <span
            aria-hidden
            className="mt-0.5 shrink-0 text-line-firm transition-colors group-hover:text-primary"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5.5 10.5 10.5 5.5M6.5 5.5h4v4" />
            </svg>
          </span>
        )}
      </div>
      <p className={`stat-value mt-2.5 text-[2rem] font-semibold leading-none tracking-tight ${TONE_TEXT[tone]}`}>
        {value}
      </p>
      {hint && <p className="mt-2.5 text-xs leading-relaxed text-ink-muted">{hint}</p>}
    </>
  );

  // A hairline of the tone along the top edge. It is the cheapest way to make a
  // row of tiles scannable without turning the whole card into a colour: the
  // eye finds the one that needs attention before it has read a single label.
  const rule =
    tone === "neutral"
      ? null
      : (
          <span
            aria-hidden
            className={`absolute inset-x-0 top-0 h-[3px] rounded-t-card ${
              tone === "good"
                ? "bg-good"
                : tone === "caution"
                  ? "bg-caution"
                  : tone === "critical"
                    ? "bg-critical"
                    : "bg-primary"
            }`}
          />
        );

  const shell =
    "card group relative flex flex-col overflow-hidden px-4 py-4 transition-shadow" +
    (href ? " hover:shadow-lifted" : "");

  if (href) {
    // Not an <a> wrapping a block for style's sake: these tiles genuinely lead
    // somewhere, and a supervisor should not have to hunt for the small link.
    return (
      <a href={href} className={shell}>
        {rule}
        {body}
      </a>
    );
  }
  return (
    <div className={shell}>
      {rule}
      {body}
    </div>
  );
}

/* -------------------------------------------------------------------------
   Status */

const BADGE_TONES: Record<Tone, string> = {
  neutral: "bg-surface-sunk text-ink-muted ring-line-firm",
  primary: "bg-primary-50 text-primary-700 ring-primary-200",
  good: "bg-good-bg text-good ring-good-line",
  caution: "bg-caution-bg text-caution ring-caution-line",
  critical: "bg-critical-bg text-critical ring-critical-line",
};

/**
 * Status always carries a word, never a colour alone — the registry has to stay
 * readable to a colour-blind reader and in a printed export, so the label is the
 * signal and the tint is a second channel that helps a sighted reader scan.
 */
export function Badge({
  children,
  tone = "neutral",
  dot = false,
}: {
  children: ReactNode;
  tone?: Tone;
  /** A leading dot for tables, where the eye tracks a column of shapes. */
  dot?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${BADGE_TONES[tone]}`}
    >
      {dot && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------
   Tables */

export function Table({
  head,
  children,
  empty,
  align = [],
}: {
  head: ReactNode[];
  children: ReactNode;
  empty?: ReactNode;
  /** Columns whose numbers should sit right, so digits line up. */
  align?: Array<"left" | "right">;
}) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[42rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line-firm">
            {head.map((cell, i) => (
              <th
                key={i}
                scope="col"
                className={`whitespace-nowrap px-5 py-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-ink-faint ${
                  align[i] === "right" ? "text-right" : "text-left"
                }`}
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return (
    <tr className="border-b border-line transition-colors last:border-0 hover:bg-primary-50/70">
      {children}
    </tr>
  );
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
    <td className={`px-5 py-3 align-middle ${align === "right" ? "text-right" : ""} ${className}`}>
      {children}
    </td>
  );
}

/**
 * Nothing to show, said properly.
 *
 * An empty state is the first thing most people see on a new deployment, and a
 * bare line of grey text reads as a page that failed rather than a page with
 * nothing in it yet.
 */
export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
      <span
        aria-hidden
        className="grid h-9 w-9 place-items-center rounded-full bg-surface-sunk text-ink-faint ring-1 ring-inset ring-line"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M3 4.5h10M3 8h10M3 11.5h6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <p className="max-w-sm text-sm leading-relaxed text-ink-muted">{children}</p>
      {action}
    </div>
  );
}

/* -------------------------------------------------------------------------
   Actions */

export function Button({
  children,
  variant = "primary",
  type = "submit",
  disabled,
  size = "md",
}: {
  children: ReactNode;
  variant?: "primary" | "quiet" | "ghost" | "danger";
  type?: "submit" | "button";
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-control font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-45";
  const sizes = { sm: "px-2.5 py-1.5 text-xs", md: "px-3.5 py-2 text-sm" };
  const tones = {
    primary: "bg-primary text-white shadow-raised hover:bg-primary-600 active:bg-primary-700",
    quiet: "bg-surface text-ink ring-1 ring-inset ring-line-firm hover:bg-surface-sunk",
    ghost: "text-ink-muted hover:bg-surface-sunk hover:text-ink",
    danger: "bg-critical-bg text-critical ring-1 ring-inset ring-critical-line hover:bg-critical/10",
  };
  return (
    <button type={type} disabled={disabled} className={`${base} ${sizes[size]} ${tones[variant]}`}>
      {children}
    </button>
  );
}

/** A machine's suggestion, shown with the reason that produced it. */
export function Reason({ children }: { children: ReactNode }) {
  return (
    <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">
      <span className="sr-only">Reason: </span>
      {children}
    </p>
  );
}

/** A reference a person may need to read aloud or type: a licence, a hash, an id. */
export function Ref({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[0.8125rem] tracking-tight text-ink-muted">{children}</span>
  );
}
