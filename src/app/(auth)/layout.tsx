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
  // Unauthenticated screens get the same classification bracketing as the rest
  // of the console — a visitor should meet the facility's posture before they
  // meet its login form.
  return (
    <div className="min-h-screen flex flex-col">
      <div className="hud-banner hud-banner--ts">
        <span>TOP SECRET</span>
        <span aria-hidden>{"//"}</span>
        <span>SCiP-220</span>
        <span aria-hidden>{"//"}</span>
        <span>AUTHORIZED PERSONNEL ONLY</span>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md flex flex-col gap-[var(--term-gap)]">
          {children}
        </div>
      </div>
      <div className="hud-banner hud-banner--ts">
        <span>ALL ACCESS ATTEMPTS ARE LOGGED AND TRACED</span>
      </div>
    </div>
  );
}
