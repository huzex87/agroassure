import { SkeletonCard, SkeletonHeader, SkeletonStats, SkeletonTable } from "../components/skeleton-blocks";

export default function Loading() {
  return (
    <>
      <SkeletonHeader />
      <SkeletonStats />
      <div className="grid gap-5 xl:grid-cols-2">
        <SkeletonCard />
        <SkeletonCard rows={3} />
      </div>
      <SkeletonTable />
    </>
  );
}
