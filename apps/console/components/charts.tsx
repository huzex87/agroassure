// Charts, drawn directly.
//
// No charting library. These are three shapes over at most twelve points, and a
// dependency would bring a bundle, a theme system that disagrees with this one,
// and a second set of accessibility habits. The registry map is drawn the same
// way for the same reason.
//
// Every one of these carries its numbers in text as well as in the drawing: a
// director reads the figure, a screen reader reads the figure, and a printed
// page keeps the figure. The shape is there to show direction, not to be the
// only place the value exists.

const MUTED = "var(--color-ink-muted)";

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
      <p className="py-8 text-center text-sm text-ink-muted">
        Not enough history yet to show a trend.
      </p>
    );
  }

  const width = 640;
  const height = 160;
  const pad = 24;
  // Ratings are a percentage, so the axis is the percentage — not the range of
  // the data. Auto-scaling would turn a wobble between 88 and 91 into a cliff.
  const min = 0;
  const max = 100;
  const x = (i: number) => pad + (i / (real.length - 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - min) / (max - min)) * (height - pad * 2);

  const line = real.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.value)}`).join(" ");
  const area = `${line} L ${x(real.length - 1)} ${height - pad} L ${x(0)} ${height - pad} Z`;

  return (
    <figure>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={`${label}. ${real.map((p) => `${p.month}: ${p.value}%`).join(", ")}`}
      >
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line
              x1={pad}
              x2={width - pad}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--color-line)"
              strokeWidth={1}
            />
            <text x={0} y={y(v) + 4} fontSize={10} fill={MUTED}>
              {v}
            </text>
          </g>
        ))}
        <path d={area} fill="var(--color-primary)" opacity={0.08} />
        <path d={line} fill="none" stroke="var(--color-primary)" strokeWidth={2.5} />
        {real.map((p, i) => (
          <circle key={p.month} cx={x(i)} cy={y(p.value)} r={3.5} fill="var(--color-primary)" />
        ))}
      </svg>
      <figcaption className="mt-1 flex justify-between text-xs text-ink-muted">
        <span>{real[0]!.month}</span>
        <span>
          Latest {real[real.length - 1]!.value}% · {real[real.length - 1]!.month}
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * Two series side by side. Used for findings raised against findings closed,
 * where the comparison is the entire point: a bar chart of raisings alone would
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
  const height = 170;
  const pad = 24;
  const slot = (width - pad * 2) / rows.length;
  const barW = Math.min(14, slot / 2.6);
  const y = (v: number) => height - pad - (v / max) * (height - pad * 2);

  return (
    <figure>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={`${aLabel} against ${bLabel}. ${rows
          .map((r) => `${r.month}: ${r.a} ${aLabel}, ${r.b} ${bLabel}`)
          .join(". ")}`}
      >
        <line
          x1={pad}
          x2={width - pad}
          y1={height - pad}
          y2={height - pad}
          stroke="var(--color-line)"
        />
        {rows.map((r, i) => {
          const cx = pad + i * slot + slot / 2;
          return (
            <g key={r.month}>
              <rect
                x={cx - barW - 2}
                y={y(r.a)}
                width={barW}
                height={height - pad - y(r.a)}
                rx={3}
                fill="var(--color-primary)"
              />
              <rect
                x={cx + 2}
                y={y(r.b)}
                width={barW}
                height={height - pad - y(r.b)}
                rx={3}
                fill="var(--color-primary-200)"
              />
              {i % 2 === 0 && (
                <text x={cx} y={height - 8} fontSize={9} fill={MUTED} textAnchor="middle">
                  {r.month.slice(2)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex gap-4 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary" />
          {aLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary-200" />
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
}: {
  percent: number | null;
  caption: string;
}) {
  return (
    <div className="space-y-2">
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuenow={percent ?? 0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={caption}
      >
        <div
          className="h-2 rounded-full bg-primary"
          style={{ width: `${Math.max(0, Math.min(100, percent ?? 0))}%` }}
        />
      </div>
      <p className="text-xs text-ink-muted">{caption}</p>
    </div>
  );
}
