"use client";

import { useActionState, useEffect, useRef } from "react";
import { addPersonnelAttachmentAction } from "../actions";
import {
  ACCEPTED_MIME,
  ACCEPTED_LABEL,
  MAX_ATTACHMENT_BYTES,
  ATTACHMENT_TTL_DAYS,
} from "@/lib/attachments";

export function PersonnelAttachmentForm({ subjectId }: { subjectId: string }) {
  const [state, formAction, pending] = useActionState(
    addPersonnelAttachmentAction,
    null
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the file input after a successful upload so the same file isn't
  // accidentally submitted twice.
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input type="hidden" name="subjectId" value={subjectId} />
      <label
        className="block text-xs text-[var(--term-fg-dim)]"
        htmlFor="personnel-attachment"
      >
        &gt; ATTACH EVIDENCE IMAGE
      </label>
      <input
        id="personnel-attachment"
        name="attachment"
        type="file"
        required
        accept={ACCEPTED_MIME}
        className="term-input text-xs"
      />
      <p className="text-[10px] text-[var(--term-fg-dim)]">
        {ACCEPTED_LABEL} · MAX {Math.floor(MAX_ATTACHMENT_BYTES / 1024)}KB ·
        AUTOMATICALLY PURGED AFTER {ATTACHMENT_TTL_DAYS} DAYS · VISIBLE TO L-4+
        ONLY
      </p>
      {state?.error && (
        <p className="text-[var(--term-red)] text-sm" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="term-button text-xs">
        {pending ? "UPLOADING..." : "ATTACH"}
      </button>
    </form>
  );
}
