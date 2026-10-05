import { cn } from "@/lib/utils";

// A trend with no axes: the shape of the last few readings, drawn small enough
// to sit inside a tile. It carries no numbers of its own, so it is always beside
// a figure that does, and it is hidden from assistive technology for that
// reason: the tile's text already says everything the line says.

export function Spark({
  values,
  className,
  stroke = "var(--primary)",
}: {
  values: number[];
  className?: string;
  stroke?: string;
}) {
  if (values.length < 2) return null;
  const w = 96;
  const h = 32;
  const pad = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = (w - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => [pad + i * step, h - pad - ((v - min) / span) * (h - pad * 2)] as const);
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1]![0].toFixed(1)} ${h} L${pts[0]![0].toFixed(1)} ${h} Z`;
  const [lx, ly] = pts[pts.length - 1]!;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn("h-8 w-24", className)}
      aria-hidden
      fill="none"
      preserveAspectRatio="none"
    >
      <path d={area} fill={stroke} opacity={0.1} />
      <path d={line} stroke={stroke} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r={2.5} fill={stroke} />
    </svg>
  );
}
