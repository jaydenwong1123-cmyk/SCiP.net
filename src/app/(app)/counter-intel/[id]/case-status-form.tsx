"use client";

import { useActionState } from "react";
import { setCaseStatusAction } from "../actions";
import { CASE_STATUSES, CASE_STATUS_LABELS, type CaseStatus } from "@/lib/counter-intel";

// RAISA's manual workflow control. Any desk member gets OPEN/IN PROGRESS/
// NEEDS ACTION; RESOLVED only renders for L-R5 — the action itself enforces
// the same gate, this just avoids offering a button that would 403.
export function CaseStatusForm({
  runId,
  current,
  canResolve,
}: {
  runId: string;
  current: CaseStatus;
  canResolve: boolean;
}) {
  const [state, formAction, pending] = useActionState(setCaseStatusAction, null);

  const options: CaseStatus[] = [
    CASE_STATUSES.open,
    CASE_STATUSES.inProgress,
    CASE_STATUSES.needsAction,
    ...(canResolve ? [CASE_STATUSES.resolved] : []),
  ];

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="runId" value={runId} />
      <div className="flex flex-wrap gap-2">
        {options.map((status) => (
          <button
            key={status}
            type="submit"
            name="status"
            value={status}
            disabled={pending || status === current}
            className={`term-button text-xs${
              status === CASE_STATUSES.resolved ? " hack-button--risk" : ""
            }`}
          >
            {status === current ? `[ ${CASE_STATUS_LABELS[status]} ]` : `MARK ${CASE_STATUS_LABELS[status]}`}
          </button>
        ))}
      </div>
      {state?.error && <p className="text-sm text-[var(--term-red)]">{state.error}</p>}
    </form>
  );
}
