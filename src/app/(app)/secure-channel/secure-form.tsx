"use client";

import { useActionState, useEffect, useRef } from "react";
import { postSecureMessageAction } from "./actions";

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
        required
        rows={3}
        placeholder="MESSAGE WILL BE ENCRYPTED IN TRANSIT..."
        className="term-input resize-y"
      />
      {state?.error && (
        <p className="text-[var(--term-red)] text-sm">{state.error}</p>
      )}
      <button type="submit" disabled={pending} className="term-button text-sm">
        {pending ? "TRANSMITTING..." : "▲ TRANSMIT"}
      </button>
    </form>
  );
}
