"use client";

import { useActionState, useEffect, useRef } from "react";
import { postSecureMessageAction } from "./actions";
import {
  ACCEPTED_MIME,
  ACCEPTED_LABEL,
  MAX_ATTACHMENT_BYTES,
  ATTACHMENT_TTL_DAYS,
} from "@/lib/attachments";

export function SecureForm() {
  const [state, formAction, pending] = useActionState(
    postSecureMessageAction,
    null
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the field after a successful transmission.
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <label className="block text-xs text-[var(--term-fg-dim)]" htmlFor="body">
        &gt; COMPOSE SECURE TRANSMISSION
      </label>
      <textarea
        id="body"
        name="body"
        rows={3}
        placeholder="MESSAGE WILL BE ENCRYPTED IN TRANSIT..."
        className="term-input resize-y"
      />
      <div>
        <label
          className="block text-xs text-[var(--term-fg-dim)] mb-1"
          htmlFor="attachment"
        >
          &gt; ATTACH IMAGE (OPTIONAL)
        </label>
        <input
          id="attachment"
          name="attachment"
          type="file"
          accept={ACCEPTED_MIME}
          className="term-input text-xs"
        />
        <p className="text-[10px] text-[var(--term-fg-dim)] mt-1">
          {ACCEPTED_LABEL} · MAX {Math.floor(MAX_ATTACHMENT_BYTES / 1024)}KB ·
          AUTOMATICALLY PURGED AFTER {ATTACHMENT_TTL_DAYS} DAYS
        </p>
      </div>
      {state?.error && (
        <p className="text-[var(--term-red)] text-sm" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="term-button text-sm">
        {pending ? "TRANSMITTING..." : "▲ TRANSMIT"}
      </button>
    </form>
  );
}
