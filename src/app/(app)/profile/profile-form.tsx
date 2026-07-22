"use client";

import { useActionState, useRef } from "react";
import { updatePersonalFileAction } from "./actions";
import { FormatToolbar } from "@/components/format-toolbar";

export function ProfileForm({
  initialContent,
  subjectId,
}: {
  initialContent: string;
  // Set when editing another member's file (RAISA/staff only); omitted for the
  // member's own profile.
  subjectId?: string;
}) {
  const [state, formAction, pending] = useActionState(updatePersonalFileAction, null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  return (
    <form action={formAction} className="space-y-3">
      {subjectId && <input type="hidden" name="subjectId" value={subjectId} />}
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
