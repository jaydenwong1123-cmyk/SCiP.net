import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { SetNameForm } from "./set-name-form";

export default async function SetNamePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.displayName) redirect("/personnel");

  return (
    <div className="term-panel w-full space-y-4">
      <div className="hud-panel-head">
        <span className="hud-panel-head__code">AUTH</span>
        <span>IDENTIFY YOURSELF</span>
        <span className="hud-panel-head__status">FIRST LOGIN</span>
      </div>
      <p className="text-sm text-[var(--term-fg-dim)]">
        ENTER THE NAME OTHER PERSONNEL WILL SEE ON THE ROSTER. THIS CANNOT BE CHANGED LATER
        WITHOUT OWNER ASSISTANCE.
      </p>
      <SetNameForm />
    </div>
  );
}
