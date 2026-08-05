"use client";

import { useActionState } from "react";
import { setCaseStatusAction, toggleCaseFlagAction } from "../actions";
import { CASE_STATUSES, CASE_STATUS_LABELS, type CaseStatus } from "@/lib/counter-intel";

// RAISA's manual workflow control. Any desk member gets IN PROGRESS/NEEDS
// ACTION; RESOLVED only renders for L-R5 — the action itself enforces the
// same gate, this just avoids offering a button that would 403. The flag
// toggle is a second, independent form: flagging carries no closing
// authority, so it stays open to every desk member regardless of caseStatus.
export function CaseStatusForm({
  runId,
  current,
  flagged,
  canResolve,
}: {
  runId: string;
  current: CaseStatus;
  flagged: boolean;
  canResolve: boolean;
}) {
  const [statusState, statusAction, statusPending] = useActionState(
    setCaseStatusAction,
    null
  );
  const [flagState, flagAction, flagPending] = useActionState(
    toggleCaseFlagAction,
    null
  );

  const options: CaseStatus[] = [
    CASE_STATUSES.needsAction,
    CASE_STATUSES.inProgress,
    ...(canResolve ? [CASE_STATUSES.resolved] : []),
  ];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <form action={statusAction} className="contents">
          <input type="hidden" name="runId" value={runId} />
          {options.map((status) => (
            <button
              key={status}
              type="submit"
              name="status"
              value={status}
              disabled={statusPending || status === current}
              className={`term-button text-xs${
                status === CASE_STATUSES.resolved ? " hack-button--risk" : ""
              }`}
            >
              {status === current
                ? `[ ${CASE_STATUS_LABELS[status]} ]`
                : `MARK ${CASE_STATUS_LABELS[status]}`}
            </button>
          ))}
        </form>
        <form action={flagAction} className="contents">
          <input type="hidden" name="runId" value={runId} />
          <button
            type="submit"
            disabled={flagPending}
            className={`term-button text-xs${
              flagged ? " text-[var(--term-amber)]" : ""
            }`}
          >
            {flagged ? "[ ⚑ FLAGGED — UNFLAG ]" : "⚑ FLAG"}
          </button>
        </form>
      </div>
      {statusState?.error && (
        <p className="text-sm text-[var(--term-red)]">{statusState.error}</p>
      )}
      {flagState?.error && (
        <p className="text-sm text-[var(--term-red)]">{flagState.error}</p>
      )}
    </div>
  );
}
