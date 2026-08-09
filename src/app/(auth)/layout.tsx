import { enforceMaintenance, enforceShutdown } from "@/lib/site-config";
import { enforceSentinel } from "@/lib/session";

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
  // A full OMEGA termination goes further: it darkens the login form itself,
  // with no code to enter. This is the difference between the site being
  // closed and the site being off.
  await enforceShutdown();
  // /set-name lives in this segment and is reachable by an authenticated member
  // who has not finished onboarding. Without this the owner could be bounced
  // there by requireUser and edit their own account while still sitting on the
  // unanswered challenge.
  await enforceSentinel();
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
