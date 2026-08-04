"use client";

import { useActionState, useState } from "react";
import { deleteHackRunAction } from "../actions";

// L-R5 only — see canDeleteCounterIntelLog(). A confirm step guards against
// a stray click purging a case file early; the 30-day retention sweep is the
// safe default, this is the manual override.
export function DeleteForm({ runId }: { runId: string }) {
  const [state, formAction, pending] = useActionState(deleteHackRunAction, null);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="term-button hack-button--risk text-xs"
      >
        [ DELETE CASE FILE ]
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="runId" value={runId} />
      <button
        type="submit"
        disabled={pending}
        className="term-button hack-button--risk text-xs"
      >
        {pending ? "DELETING..." : "[ CONFIRM DELETE — CANNOT BE UNDONE ]"}
      </button>
      {state?.error && (
        <p className="text-sm text-[var(--term-red)]">{state.error}</p>
      )}
    </form>
  );
}
