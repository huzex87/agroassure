// Charts, drawn directly.
//
// No charting library. These are three shapes over at most twelve points, and a
// dependency would bring a bundle, a theme system that disagrees with this one,
// and a second set of accessibility habits. The registry map is drawn the same
// way for the same reason.
//
// Every one of these carries its numbers in text as well as in the drawing: a
// director reads the figure, a screen reader reads the figure, and a printed
// page keeps the figure. The shape shows direction; it is never the only place
// the value exists.

const MUTED = "var(--color-ink-faint)";
const GRID = "var(--color-line)";

export function Sparkline({
  points,
  label,
}: {
  points: Array<{ month: string; value: number | null }>;
  label: string;
}) {
  const real = points.filter((p) => p.value !== null) as Array<{ month: string; value: number }>;
  if (real.length < 2) {
    return (
      <p className="py-10 text-center text-sm text-ink-muted">
        Not enough history yet to show a trend.
      </p>
    );
  }

  const width = 640;
  const height = 170;
  const padX = 30;
  const padY = 20;
  // Ratings are a percentage, so the axis is the percentage — not the range of
  // the data. Auto-scaling would turn a wobble between 88 and 91 into a cliff.
  const x = (i: number) => padX + (i / (real.length - 1)) * (width - padX - 12);
  const y = (v: number) => height - padY - (v / 100) * (height - padY * 2);

  const line = real.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.value)}`).join(" ");
  const area = `${line} L ${x(real.length - 1)} ${height - padY} L ${x(0)} ${height - padY} Z`;
  const last = real[real.length - 1]!;

  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={`${label}. ${real.map((p) => `${p.month}: ${p.value}%`).join(", ")}`}
      >
        <defs>
          <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.20" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line
              x1={padX}
              x2={width - 12}
              y1={y(v)}
              y2={y(v)}
              stroke={GRID}
              strokeWidth={1}
              strokeDasharray={v === 0 ? undefined : "3 4"}
            />
            <text x={0} y={y(v) + 3.5} fontSize={10} fill={MUTED}>
              {v}
            </text>
          </g>
        ))}

        <path d={area} fill="url(#spark-fill)" />
        <path
          d={line}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth={2.25}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Only the endpoint gets a marker. Twelve dots is noise; the latest
            reading is the one a director is actually looking for. */}
        <circle cx={x(real.length - 1)} cy={y(last.value)} r={5} fill="var(--color-surface)" />
        <circle
          cx={x(real.length - 1)}
          cy={y(last.value)}
          r={3.5}
          fill="var(--color-primary)"
        />
      </svg>
      <figcaption className="flex items-baseline justify-between text-xs text-ink-muted">
        <span>{real[0]!.month}</span>
        <span>
          <span className="font-semibold tabular-nums text-ink">{last.value}%</span> · {last.month}
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * Two series side by side. Used for findings raised against findings closed,
 * where the comparison is the entire point: a chart of raisings alone would
 * flatter a regulator that never closes anything.
 */
export function PairedBars({
  rows,
  aLabel,
  bLabel,
}: {
  rows: Array<{ month: string; a: number; b: number }>;
  aLabel: string;
  bLabel: string;
}) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.a, r.b)));
  const width = 640;
  const height = 176;
  const padX = 8;
  const padY = 22;
  const slot = (width - padX * 2) / Math.max(rows.length, 1);
  const barW = Math.min(13, slot / 2.8);
  const y = (v: number) => height - padY - (v / max) * (height - padY * 2);

  return (
    <figure className="flex flex-col gap-2.5">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={`${aLabel} against ${bLabel}. ${rows
          .map((r) => `${r.month}: ${r.a} ${aLabel}, ${r.b} ${bLabel}`)
          .join(". ")}`}
      >
        <line
          x1={padX}
          x2={width - padX}
          y1={height - padY}
          y2={height - padY}
          stroke="var(--color-line-firm)"
        />
        {rows.map((r, i) => {
          const cx = padX + i * slot + slot / 2;
          return (
            <g key={r.month}>
              <rect
                x={cx - barW - 1.5}
                y={y(r.a)}
                width={barW}
                height={Math.max(0, height - padY - y(r.a))}
                rx={2.5}
                fill="var(--color-primary)"
              />
              <rect
                x={cx + 1.5}
                y={y(r.b)}
                width={barW}
                height={Math.max(0, height - padY - y(r.b))}
                rx={2.5}
                fill="var(--color-good)"
              />
              {i % 2 === 0 && (
                <text x={cx} y={height - 7} fontSize={9.5} fill={MUTED} textAnchor="middle">
                  {r.month.slice(2)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-[3px] bg-primary" />
          {aLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-[3px] bg-good" />
          {bLabel}
        </span>
      </figcaption>
    </figure>
  );
}

/** A proportion, stated as a number and drawn as a bar. */
export function Meter({
  percent,
  caption,
  tone = "primary",
}: {
  percent: number | null;
  caption: string;
  tone?: "primary" | "good" | "caution";
}) {
  const width = Math.max(0, Math.min(100, percent ?? 0));
  const fill =
    tone === "good" ? "bg-good" : tone === "caution" ? "bg-caution" : "bg-primary";
  return (
    <div className="flex flex-col gap-2">
      <div
        className="h-2 w-full overflow-hidden rounded-pill bg-surface-sunk ring-1 ring-inset ring-line"
        role="progressbar"
        aria-valuenow={percent ?? 0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={caption}
      >
        <div
          className={`h-full rounded-pill ${fill} transition-[width] duration-500`}
          style={{ width: `${width}%` }}
        />
      </div>
      <p className="text-xs leading-relaxed text-ink-muted">{caption}</p>
    </div>
  );
}
