import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { SetNameForm } from "./set-name-form";

export default async function SetNamePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.displayName) redirect("/personnel");

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="term-panel w-full max-w-md space-y-4">
        <h1 className="text-lg tracking-widest">:: FIRST LOGIN — IDENTIFY YOURSELF ::</h1>
        <p className="text-sm text-[var(--term-fg-dim)]">
          ENTER THE NAME OTHER PERSONNEL WILL SEE ON THE ROSTER. THIS CANNOT BE CHANGED LATER
          WITHOUT OWNER ASSISTANCE.
        </p>
        <SetNameForm />
      </div>
    </div>
  );
}
