import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { enforceMaintenance } from "@/lib/site-config";

export default async function HomePage() {
  await enforceMaintenance();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.suspended) redirect("/suspended");
  if (!user.displayName) redirect("/set-name");
  redirect("/menu");
}
