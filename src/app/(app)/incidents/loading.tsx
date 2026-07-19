import { SkeletonPage } from "@/components/skeleton";

export default function Loading() {
  return <SkeletonPage rows={8} action={true} label="Loading incident reports" />;
}
