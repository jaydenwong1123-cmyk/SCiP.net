"use client";

import { useActionState } from "react";
import { updatePersonalFileAction } from "./actions";

export function ProfileForm({ initialContent }: { initialContent: string }) {
  const [state, formAction, pending] = useActionState(updatePersonalFileAction, null);

  return (
    <form action={formAction} className="space-y-3">
      <textarea
        name="personalFile"
        defaultValue={initialContent}
        rows={16}
        className="term-input resize-y"
        placeholder="Write your personnel file here..."
      />
      <button type="submit" disabled={pending} className="term-button">
        {pending ? "SAVING..." : "SAVE FILE"}
      </button>
      {state?.ok && <span className="text-[var(--term-fg-bright)] ml-3 text-sm">SAVED.</span>}
    </form>
  );
}
