"use client";

import { useActionState, useRef } from "react";
import { updatePersonalFileAction } from "./actions";
import { FormatToolbar } from "@/components/format-toolbar";

export function ProfileForm({ initialContent }: { initialContent: string }) {
  const [state, formAction, pending] = useActionState(updatePersonalFileAction, null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  return (
    <form action={formAction} className="space-y-3">
      <FormatToolbar targetRef={bodyRef} />
      <textarea
        ref={bodyRef}
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
      {state && !state.ok && state.error && (
        <span className="text-[var(--term-red)] ml-3 text-sm">{state.error}</span>
      )}
    </form>
  );
}
