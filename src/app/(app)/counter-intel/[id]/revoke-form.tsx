"use client";

import { useActionState } from "react";
import { revokeHackGrantAction } from "../actions";

// Revocation is gated on a completed trace, both here and in the action.
// Showing a disabled control rather than hiding it makes the requirement
// legible: RAISA can see the lever exists and what it costs to earn it.
export function RevokeForm({
  runId,
  identified,
}: {
  runId: string;
  identified: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    revokeHackGrantAction,
    null
  );

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="runId" value={runId} />
      <button
        type="submit"
        disabled={pending || !identified}
        className="term-button hack-button--risk"
      >
        {pending ? "SEVERING..." : "[ SEVER ACCESS ]"}
      </button>
      {!identified && (
        <p className="text-xs text-[var(--term-fg-dim)]">
          IDENTIFY THE OPERATOR BEFORE SEVERING.
        </p>
      )}
      {state?.error && (
        <p className="text-sm text-[var(--term-red)]">{state.error}</p>
      )}
    </form>
  );
}
