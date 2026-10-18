"use client";

import { useActionState } from "react";
import { updateDossierAction } from "../actions";

export function DossierForm({ initialContent }: { initialContent: string }) {
  const [state, formAction, pending] = useActionState(updateDossierAction, null);

  return (
    <form action={formAction} className="space-y-3">
      <textarea
        name="dossier"
        defaultValue={initialContent}
        rows={16}
        maxLength={20000}
        className="term-input resize-y"
        placeholder="Callsign, history, skills, grudges..."
      />
      <button type="submit" disabled={pending} className="term-button">
        {pending ? "SAVING..." : "SAVE DOSSIER"}
      </button>
      {state?.ok && <span className="text-[var(--term-fg-bright)] ml-3 text-sm">SAVED.</span>}
      {state && !state.ok && state.error && (
        <span className="text-[var(--term-red)] ml-3 text-sm">{state.error}</span>
      )}
    </form>
  );
}
