"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

// The charts, on Recharts through shadcn's container.
//
// These were drawn by hand in SVG, which was the right call while there were
// three shapes over twelve points and no library in the tree. They are now a
// real part of how the programme is read, and hand-drawing bought a growing
// pile of axis arithmetic and no interaction: a director could see the shape of
// the trend but could not ask what any month actually was.
//
// Every one still carries its numbers in text as well as in the drawing — the
// tooltip is an addition, never the only place a value exists — and the axis is
// the measure rather than the range of the data, so a wobble between 88 and 91
// stays a wobble instead of becoming a cliff.
//
// Nothing animates in. Recharts grows its series from zero over a second and a
// half by default, so the first frame of a dashboard is an empty chart and the
// second is a half-true one — on a page that already waited on the database,
// that reads as broken rather than as lively, and a figure a director is about
// to act on should never be shown briefly wrong.

/** Short month for an axis: "2026-03" reads as "Mar". */
function monthTick(value: string): string {
  const [, m] = value.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return names[Number(m) - 1] ?? value;
}

function monthFull(value: string): string {
  const [y, m] = value.split("-");
  const names = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${names[Number(m) - 1] ?? m} ${y}`;
}

/* -------------------------------------------------------------------------
   Compliance trend */

const trendConfig = {
  rating: { label: "Average rating", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function ComplianceTrend({
  points,
}: {
  points: Array<{ month: string; value: number | null; inspections?: number }>;
}) {
  const data = points.filter((p) => p.value !== null);

  if (data.length < 2) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        Not enough history yet to show a trend. A month appears here once it has a submitted
        inspection.
      </p>
    );
  }

  const last = data[data.length - 1]!;

  return (
    <div className="flex flex-col gap-3">
      <ChartContainer config={trendConfig} className="aspect-[16/7] w-full">
        <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="fill-rating" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-rating)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--color-rating)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 4" />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={monthTick}
            minTickGap={16}
          />
          {/* The axis is the percentage, not the range of the data: auto-scaling
              would turn a wobble between 88 and 91 into a cliff. */}
          {/* width holds the widest tick: at 36 the axis clipped "100" to "00". */}
          <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickLine={false} axisLine={false} width={38} />
          <ChartTooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={
              <ChartTooltipContent
                labelFormatter={(v) => monthFull(String(v))}
                formatter={(value) => (
                  <span className="flex w-full justify-between gap-4">
                    <span className="text-muted-foreground">Average rating</span>
                    <span className="font-mono font-medium tabular-nums">{String(value)}%</span>
                  </span>
                )}
              />
            }
          />
          <Area
            isAnimationActive={false}
            dataKey="value"
            name="rating"
            type="monotone"
            stroke="var(--color-rating)"
            strokeWidth={2.25}
            fill="url(#fill-rating)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
          />
        </AreaChart>
      </ChartContainer>
      <p className="text-muted-foreground flex items-baseline justify-between text-xs">
        <span>{monthFull(data[0]!.month)}</span>
        <span>
          Latest <span className="text-foreground font-semibold tabular-nums">{last.value}%</span> ·{" "}
          {monthFull(last.month)}
        </span>
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------
   Findings raised against closed */

const flowConfig = {
  raised: { label: "Raised", color: "var(--chart-4)" },
  closed: { label: "Closed", color: "var(--chart-2)" },
} satisfies ChartConfig;

/**
 * The comparison is the entire point: a chart of raisings alone would flatter a
 * regulator that never closes anything, which is why raised takes the critical
 * hue and closed takes the settled one.
 */
export function FindingsFlow({
  rows,
}: {
  rows: Array<{ month: string; raised: number; closed: number }>;
}) {
  return (
    <ChartContainer config={flowConfig} className="aspect-[16/7] w-full">
      <BarChart data={rows} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 4" />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={monthTick}
          minTickGap={12}
        />
        <YAxis tickLine={false} axisLine={false} width={38} allowDecimals={false} />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent labelFormatter={(v) => monthFull(String(v))} />}
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="raised" fill="var(--color-raised)" radius={[3, 3, 0, 0]} maxBarSize={14} isAnimationActive={false} />
        <Bar dataKey="closed" fill="var(--color-closed)" radius={[3, 3, 0, 0]} maxBarSize={14} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  );
}

/* -------------------------------------------------------------------------
   Coverage */

const coverageConfig = {
  covered: { label: "Inspected in 12 months", color: "var(--chart-1)" },
} satisfies ChartConfig;

/**
 * Coverage as a dial, because it is a proportion of a whole and a director reads
 * it as "how much of the register" rather than as a bar length. The number sits
 * in the middle in text, so nothing depends on reading the arc.
 */
export function CoverageDial({
  percent,
  inspected,
  total,
}: {
  percent: number | null;
  inspected: number;
  total: number;
}) {
  const value = percent ?? 0;
  const tone = value >= 75 ? "var(--chart-2)" : value >= 50 ? "var(--chart-3)" : "var(--chart-4)";

  return (
    <div className="relative">
      <ChartContainer config={coverageConfig} className="mx-auto aspect-square w-full max-w-[13rem]">
        <RadialBarChart
          data={[{ name: "covered", value, fill: tone }]}
          startAngle={90}
          endAngle={-270}
          innerRadius="72%"
          outerRadius="100%"
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
          <RadialBar dataKey="value" background cornerRadius={999} isAnimationActive={false} />
        </RadialBarChart>
      </ChartContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[2.25rem] leading-none font-semibold tracking-tight tabular-nums" style={{ color: tone }}>
          {percent === null ? "—" : `${percent}%`}
        </span>
        <span className="text-muted-foreground mt-1.5 text-xs">
          {inspected} of {total}
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
   Where the register stands */

const registerConfig = {
  valid: { label: "Valid", color: "var(--chart-2)" },
  due_soon: { label: "Due soon", color: "var(--chart-3)" },
  overdue: { label: "Overdue", color: "var(--chart-4)" },
  never_inspected: { label: "Not yet inspected", color: "var(--muted-foreground)" },
} satisfies ChartConfig;

/** The register split by certificate state — the one figure that is a whole. */
export function RegisterSplit({ counts }: { counts: Record<string, number> }) {
  const data = (["valid", "due_soon", "overdue", "never_inspected"] as const)
    .map((key) => ({ key, label: String(registerConfig[key].label), value: counts[key] ?? 0 }))
    .filter((d) => d.value > 0);

  if (data.length === 0) {
    return <p className="text-muted-foreground py-10 text-center text-sm">No facility is registered yet.</p>;
  }

  return (
    <ChartContainer config={registerConfig} className="aspect-[16/9] w-full">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent nameKey="key" hideLabel />} />
        <Pie
          data={data}
          dataKey="value"
          nameKey="key"
          innerRadius="52%"
          outerRadius="82%"
          paddingAngle={2}
          isAnimationActive={false}
        >
          {data.map((d) => (
            <Cell key={d.key} fill={`var(--color-${d.key})`} stroke="var(--card)" strokeWidth={2} />
          ))}
        </Pie>
        <ChartLegend content={<ChartLegendContent nameKey="key" />} />
      </PieChart>
    </ChartContainer>
  );
}

/* -------------------------------------------------------------------------
   Where the value chain is failing */

const sectionConfig = {
  findings: { label: "Findings", color: "var(--chart-1)" },
  critical: { label: "Critical", color: "var(--chart-4)" },
} satisfies ChartConfig;

/**
 * Sections down the side rather than across the bottom: section titles are
 * phrases, and a category axis turns them into overlapping diagonal text the
 * moment there are more than four.
 */
export function FindingsBySection({
  rows,
}: {
  rows: Array<{ section_title: string; findings: number; critical: number }>;
}) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground py-10 text-center text-sm">No findings recorded yet.</p>;
  }

  return (
    <ChartContainer
      config={sectionConfig}
      className="w-full"
      style={{ aspectRatio: "auto", height: `${Math.max(140, rows.length * 42)}px` }}
    >
      <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 28, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 4" />
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="section_title"
          tickLine={false}
          axisLine={false}
          width={150}
          tickMargin={6}
        />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <Bar
          dataKey="findings"
          fill="var(--color-findings)"
          radius={[0, 4, 4, 0]}
          maxBarSize={18}
          isAnimationActive={false}
        >
          <LabelList
            dataKey="findings"
            position="right"
            offset={8}
            className="fill-muted-foreground"
            fontSize={11}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
