import { SkeletonHeader, SkeletonTable } from "../../components/skeleton-blocks";

export default function Loading() {
  return (
    <>
      <SkeletonHeader />
      <SkeletonTable rows={8} />
    </>
  );
}
