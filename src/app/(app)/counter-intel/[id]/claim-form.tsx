"use client";

import { useActionState } from "react";
import { claimCaseAction, releaseCaseAction } from "../actions";
import { formatDuration } from "@/lib/hack/config";

// Case ownership control.
//
// Three states, and the button offered depends on which one holds:
//   unheld            → CLAIM
//   held by you       → RELEASE, plus how long is left on it
//   held by another   → no button, just who has it
//
// Deliberately NOT a lock. Nothing stops another officer working a claimed
// case — see the note on claimCaseAction. This is a coordination signal, so
// the UI states who holds it rather than disabling anything else on the page.
export function ClaimForm({
  runId,
  claimedByName,
  heldByMe,
  claimExpiresAtMs,
  nowMs,
}: {
  runId: string;
  claimedByName: string | null;
  heldByMe: boolean;
  claimExpiresAtMs: number | null;
  /** Server's clock at render, so the remaining-time figure is not read from the browser's. */
  nowMs: number;
}) {
  const [claimState, claim, claiming] = useActionState(claimCaseAction, null);
  const [releaseState, release, releasing] = useActionState(
    releaseCaseAction,
    null
  );

  const remaining =
    claimExpiresAtMs !== null ? Math.max(0, claimExpiresAtMs - nowMs) : null;

  return (
    <div className="space-y-2">
      {claimedByName === null ? (
        <form action={claim} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="runId" value={runId} />
          <button
            type="submit"
            disabled={claiming}
            className="term-button text-xs"
          >
            {claiming ? "CLAIMING..." : "◆ CLAIM CASE"}
          </button>
          <span className="text-xs text-[var(--term-fg-dim)]">
            SIGNALS TO THE DESK THAT YOU ARE WORKING THIS CASE.
          </span>
        </form>
      ) : heldByMe ? (
        <form action={release} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="runId" value={runId} />
          <span className="text-xs text-[var(--term-fg-bright)]">
            ◆ HELD BY YOU
            {remaining !== null && ` — LAPSES IN ${formatDuration(remaining)}`}
          </span>
          <button
            type="submit"
            disabled={releasing}
            className="term-button term-button--ghost text-xs"
          >
            {releasing ? "RELEASING..." : "RELEASE"}
          </button>
        </form>
      ) : (
        <p className="text-xs text-[var(--term-amber)]">
          ◆ HELD BY {claimedByName}
          {remaining !== null && ` — LAPSES IN ${formatDuration(remaining)}`}
        </p>
      )}

      {claimState?.error && (
        <p className="text-sm text-[var(--term-red)]">{claimState.error}</p>
      )}
      {releaseState?.error && (
        <p className="text-sm text-[var(--term-red)]">{releaseState.error}</p>
      )}
    </div>
  );
}
