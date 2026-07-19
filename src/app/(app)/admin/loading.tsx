import { SkeletonPage } from "@/components/skeleton";

export default function Loading() {
  return <SkeletonPage rows={10} action={false} label="Loading administration panel" />;
}
