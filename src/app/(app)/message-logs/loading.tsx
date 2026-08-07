import { SkeletonPage } from "@/components/skeleton";

export default function Loading() {
  return <SkeletonPage rows={6} label="Loading message logs" />;
}
