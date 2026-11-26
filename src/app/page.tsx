import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { enforceMaintenance, enforceShutdown } from "@/lib/site-config";
import { Landing } from "@/components/landing";

// "/" is two things. A signed-in member is sent on to wherever they belong; a
// visitor with no session gets the public landing page instead of being
// dropped straight onto the login form. See PUBLIC_PATHS in proxy.ts.
export default async function HomePage() {
  await enforceMaintenance();
  const user = await getCurrentUser();
  if (!user) {
    // A terminated network shows visitors the same dark screen the login form
    // does, not a page inviting them to join.
    await enforceShutdown();
    return <Landing />;
  }
  if (user.suspended) redirect("/suspended");
  if (user.isInsurgent) redirect("/insurgency");
  if (!user.displayName) redirect("/set-name");
  redirect("/menu");
}
