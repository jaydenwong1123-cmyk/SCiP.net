import { notFound } from "next/navigation";
import { getSiteConfig } from "@/lib/site-config";
import { ciEnabled } from "@/lib/ci/access";
import { EnlistForm } from "./enlist-form";

// Chaos Insurgency signup. Linked from nowhere on the site; the people who are
// meant to find it are handed the URL and the code out of roleplay. While the
// feature is off the route does not exist at all.
export default async function EnlistPage() {
  const cfg = await getSiteConfig();
  if (!ciEnabled(cfg)) notFound();
  return <EnlistForm open={cfg.ciSignupEnabled} />;
}
