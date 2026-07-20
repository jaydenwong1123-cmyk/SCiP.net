"use client";

import { useActionState } from "react";
import { grantScpAccessAction } from "../actions";

export function AccessForm({
  scpFileId,
  members,
}: {
  scpFileId: string;
  members: { id: string; displayName: string | null; clearance: number }[];
}) {
  const [state, formAction, pending] = useActionState(grantScpAccessAction, null);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="scpFileId" value={scpFileId} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-[var(--term-fg-dim)] flex flex-col gap-1">
          MEMBER
          <select name="userId" required className="term-input text-sm">
            <option value="">-- SELECT --</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName} (L-{m.clearance})
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[var(--term-fg-dim)] flex flex-col gap-1">
          DURATION (DAYS)
          <input
            type="number"
            name="days"
            min={1}
            max={30}
            defaultValue={7}
            required
            className="term-input text-sm w-24"
          />
        </label>
        <button type="submit" disabled={pending} className="term-button text-xs">
          [GRANT TEMPORARY ACCESS]
        </button>
      </div>
      {state?.error && (
        <p className="text-xs" style={{ color: "var(--term-red)" }}>
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="text-xs text-[var(--term-fg-dim)]">ACCESS GRANTED.</p>
      )}
    </form>
  );
}
