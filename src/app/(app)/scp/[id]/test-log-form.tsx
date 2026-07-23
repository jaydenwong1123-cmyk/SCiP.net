"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addScpTestLogAction } from "../actions";

export function TestLogForm({ scpFileId }: { scpFileId: string }) {
  const [state, formAction, pending] = useActionState(addScpTestLogAction, null);
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Collapse the form once a log lands. Adjusting state during render (rather
  // than from an effect) is the supported way to react to a changed value
  // without triggering a second render pass.
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state?.ok) setOpen(false);
  }

  // Clearing the fields is a DOM operation, so it does belong in an effect.
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="term-button text-xs"
      >
        + FILE TEST LOG
      </button>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input type="hidden" name="scpFileId" value={scpFileId} />
      <label className="block text-xs text-[var(--term-fg-dim)]">
        PROCEDURE
        <textarea
          name="procedure"
          required
          rows={3}
          maxLength={8000}
          placeholder="Subject exposed to the anomaly under standard containment..."
          className="term-input resize-y mt-1"
        />
      </label>
      <label className="block text-xs text-[var(--term-fg-dim)]">
        RESULT
        <textarea
          name="result"
          required
          rows={3}
          maxLength={8000}
          placeholder="Observed effect..."
          className="term-input resize-y mt-1"
        />
      </label>
      <label className="block text-xs text-[var(--term-fg-dim)]">
        NOTE (OPTIONAL)
        <textarea
          name="notes"
          rows={2}
          maxLength={8000}
          placeholder="Researcher commentary..."
          className="term-input resize-y mt-1"
        />
      </label>
      {state?.error && (
        <p className="text-sm" style={{ color: "var(--term-red)" }} role="alert">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="term-button text-xs">
          {pending ? "FILING..." : "SUBMIT TEST LOG"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="term-button text-xs"
        >
          CANCEL
        </button>
      </div>
    </form>
  );
}
