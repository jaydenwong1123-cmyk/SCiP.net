import { SkeletonPage } from "@/components/skeleton";

export default function Loading() {
  return <SkeletonPage rows={4} action={false} label="Loading broadcasts" />;
}
