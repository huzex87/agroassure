import type { ReactNode } from "react";

// The handful of primitives this console needs.
//
// ponytail: the stack names shadcn/ui, which is a generator that copies dozens
// of components into the repo. Six primitives is what these screens actually
// use, so they are written here instead. Reach for shadcn when the component
// count justifies the generator, not before.

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card p-5 ${className}`}>
      {(title || actions) && (
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "warn";
}) {
  return (
    <div className="card p-4">
      <p className="text-sm text-ink-muted">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          tone === "warn" ? "text-primary-700" : "text-ink"
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

type BadgeTone = "neutral" | "primary" | "warn" | "quiet";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "bg-primary-50 text-ink-muted ring-line",
  primary: "bg-primary-100 text-primary-700 ring-primary-200",
  warn: "bg-primary-600/10 text-primary-700 ring-primary-600/30",
  quiet: "bg-canvas text-ink-muted ring-line",
};

/**
 * Status always carries a word, never a colour alone. The registry and the
 * worklist have to stay readable to a colour-blind reader and in a printed
 * export, so the label is the signal and the tint is decoration.
 */
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: BadgeTone;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function Table({
  head,
  children,
  empty,
}: {
  head: ReactNode[];
  children: ReactNode;
  empty?: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            {head.map((cell, i) => (
              <th key={i} className="px-3 py-2 font-medium text-ink-muted">
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
  return <tr className="border-b border-line/70 last:border-0 hover:bg-primary-50/60">{children}</tr>;
}

export function Cell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <td className={`px-3 py-2.5 align-top ${className}`}>{children}</td>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-3 py-8 text-center text-sm text-ink-muted">{children}</p>;
}

export function Button({
  children,
  variant = "primary",
  type = "submit",
  disabled,
}: {
  children: ReactNode;
  variant?: "primary" | "quiet";
  type?: "submit" | "button";
  disabled?: boolean;
}) {
  const base =
    "inline-flex items-center justify-center rounded-[12px] px-3.5 py-2 text-sm font-medium transition disabled:opacity-50";
  const tone =
    variant === "primary"
      ? "bg-primary text-white hover:bg-primary-600"
      : "bg-white text-ink ring-1 ring-inset ring-line hover:bg-primary-50";
  return (
    <button type={type} disabled={disabled} className={`${base} ${tone}`}>
      {children}
    </button>
  );
}

/** A machine's suggestion, shown with the reason that produced it. */
export function Reason({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm text-ink-muted">
      <span className="sr-only">Reason: </span>
      {children}
    </p>
  );
}
