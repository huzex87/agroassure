// What a page looks like while its data is still coming.
//
// Every page in this console is force-dynamic — compliance figures are read
// fresh, because a dashboard showing yesterday's findings is worse than one
// that took another moment. That honesty costs three to five seconds against a
// real database, and for all of it the reader was looking at nothing: no title,
// no shape, no evidence the click had registered. A blank pause reads as a
// broken application long before it reads as a slow one.
//
// These mirror the real layout closely enough that nothing jumps when the data
// lands. They are the same widths and the same grid, so the page settles rather
// than reflows.

function Shimmer({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-surface-sunk ${className}`} />;
}

export function SkeletonHeader() {
  return (
    <div className="flex flex-col gap-2.5">
      <Shimmer className="h-7 w-64" />
      <Shimmer className="h-4 w-96 max-w-full" />
    </div>
  );
}

export function SkeletonStats({ count = 5 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card flex flex-col gap-3 px-4 py-4">
          <Shimmer className="h-3.5 w-28" />
          <Shimmer className="h-7 w-16" />
          <Shimmer className="h-3 w-36" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCard({ rows = 4, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`card flex flex-col gap-4 p-5 ${className}`}>
      <div className="flex flex-col gap-2">
        <Shimmer className="h-4 w-44" />
        <Shimmer className="h-3.5 w-72 max-w-full" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Shimmer className="h-8 w-8 shrink-0 rounded-lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Shimmer className="h-3.5 w-1/2" />
              <Shimmer className="h-3 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 6 }: { rows?: number }) {
  return (
    <div className="card flex flex-col gap-4 p-5">
      <Shimmer className="h-4 w-40" />
      <div className="flex flex-col gap-2.5">
        <Shimmer className="h-3 w-full" />
        {Array.from({ length: rows }, (_, i) => (
          <Shimmer key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}

export function SkeletonChart() {
  return (
    <div className="card flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-2">
        <Shimmer className="h-4 w-40" />
        <Shimmer className="h-3.5 w-64 max-w-full" />
      </div>
      <Shimmer className="h-[9.5rem] w-full" />
    </div>
  );
}
