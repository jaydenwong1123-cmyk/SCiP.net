import { SkeletonPage } from "@/components/skeleton";

// Uses the shared primitives rather than a hand-rolled copy, so the fallback
// keeps matching the station layout whenever that changes.
export default function Loading() {
  return <SkeletonPage rows={5} action label="Loading messages" />;
}
