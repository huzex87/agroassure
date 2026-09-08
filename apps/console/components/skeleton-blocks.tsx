import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// What a page looks like while its data is still coming.
//
// Every page here is force-dynamic — compliance figures are read fresh, because
// a dashboard showing yesterday's findings is worse than one that took another
// moment. That honesty costs three to five seconds against a real database, and
// for all of it the reader was looking at nothing: no title, no shape, no
// evidence the click had registered. A blank pause reads as a broken
// application long before it reads as a slow one.
//
// These mirror the real layout closely enough that nothing jumps when the data
// lands: same widths, same grid, so the page settles rather than reflows.

export function SkeletonHeader() {
  return (
    <div className="flex flex-col gap-2.5">
      <Skeleton className="h-7 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
    </div>
  );
}

export function SkeletonStats({ count = 5 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} className="gap-3 px-4 py-4">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-3 w-36" />
        </Card>
      ))}
    </div>
  );
}

export function SkeletonCard({ rows = 4 }: { rows?: number }) {
  return (
    <Card className="gap-4 p-5">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-3.5 w-72 max-w-full" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-8 shrink-0 rounded-lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function SkeletonTable({ rows = 6 }: { rows?: number }) {
  return (
    <Card className="gap-4 p-5">
      <Skeleton className="h-4 w-40" />
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-3 w-full" />
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </Card>
  );
}

export function SkeletonChart() {
  return (
    <Card className="gap-4 p-5">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3.5 w-64 max-w-full" />
      </div>
      <Skeleton className="aspect-[16/7] w-full" />
    </Card>
  );
}
