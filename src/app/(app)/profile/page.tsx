import { requireUser } from "@/lib/session";
import { clearanceLabel } from "@/lib/clearance";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const user = await requireUser();

  return (
    <div className="term-panel space-y-4">
      <h1 className="text-lg tracking-widest">:: MY PROFILE ::</h1>
      <p className="text-sm text-[var(--term-fg-dim)]">
        NAME: {user.displayName} — CLEARANCE: {clearanceLabel(user.clearance)} — LOGIN:{" "}
        {user.email}
      </p>
      <p className="text-sm text-[var(--term-fg-dim)]">
        PERSONAL FILE (visible to all personnel via the roster):
      </p>
      <ProfileForm initialContent={user.personalFile} />
    </div>
  );
}
