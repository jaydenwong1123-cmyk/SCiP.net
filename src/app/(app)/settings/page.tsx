import { requireUser } from "@/lib/session";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  await requireUser();

  return (
    <div className="term-panel space-y-4">
      <h1 className="text-lg tracking-widest">:: DISPLAY SETTINGS ::</h1>
      <p className="text-sm text-[var(--term-fg-dim)]">
        CUSTOMIZE THE TERMINAL APPEARANCE FOR YOUR SESSION.
      </p>
      <SettingsForm />
    </div>
  );
}
