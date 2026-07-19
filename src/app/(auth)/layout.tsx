import { enforceMaintenance } from "@/lib/site-config";

// The maintenance gate must run on every request, so this segment (login /
// register / set-name) can't be statically prerendered.
export const dynamic = "force-dynamic";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // During maintenance, even the login/register screens are gated behind the
  // bypass code (owner and code-holders enter via /maintenance first).
  await enforceMaintenance();
  return <>{children}</>;
}
