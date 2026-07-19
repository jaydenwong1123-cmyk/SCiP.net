import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { LogoutButton } from "@/components/logout-button";

export default async function SuspendedPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Not actually suspended? Send them back into the app.
  if (!user.suspended) redirect("/personnel");

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="alert-panel w-full max-w-md space-y-4 text-center">
        <div className="alert-stripe" aria-hidden />
        <h1 className="text-lg tracking-widest text-[var(--term-red)]">
          ⚠ ACCESS SUSPENDED ⚠
        </h1>
        <p className="text-sm">
          YOUR CREDENTIALS HAVE BEEN SUSPENDED BY FOUNDATION ADMINISTRATION.
        </p>
        <p className="text-sm text-[var(--term-amber)]">
          TO APPEAL OR REINSTATE ACCESS, CONTACT A{" "}
          <span className="text-[var(--term-fg-bright)]">RAISA AGENT</span>{" "}
          (RECORDKEEPING &amp; INFORMATION SECURITY ADMINISTRATION).
        </p>
        {user.suspendedReason && (
          <p className="text-sm text-[var(--term-fg-dim)]">
            REASON: {user.suspendedReason}
          </p>
        )}
        <div className="alert-stripe" aria-hidden />
        <div className="pt-1">
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}
