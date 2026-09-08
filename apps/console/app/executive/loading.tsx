import { SkeletonChart, SkeletonHeader, SkeletonStats, SkeletonTable } from "../../components/skeleton-blocks";

export default function Loading() {
  return (
    <>
      <SkeletonHeader />
      <SkeletonChart />
      <div className="grid gap-5 lg:grid-cols-2">
        <SkeletonChart />
        <SkeletonChart />
      </div>
      <SkeletonStats count={4} />
      <div className="grid gap-5 lg:grid-cols-2">
        <SkeletonTable rows={5} />
        <SkeletonTable rows={5} />
      </div>
    </>
  );
}
