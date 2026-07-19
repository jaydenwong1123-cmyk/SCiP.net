"use client";

import { useActionState } from "react";
import { createClearanceRequestAction } from "./actions";
import { CLEARANCE_LEVELS, MAX_REQUESTABLE_CLEARANCE } from "@/lib/clearance";

export function ClearanceRequestForm({ currentClearance }: { currentClearance: number }) {
  const [state, formAction, pending] = useActionState(createClearanceRequestAction, null);
  // Members may only request levels above their own and up to the requestable
  // cap — Level 4 and above must be assigned by staff.
  const higherLevels = CLEARANCE_LEVELS.filter(
    (l) => l.rank > currentClearance && l.rank <= MAX_REQUESTABLE_CLEARANCE
  );

  if (higherLevels.length === 0) {
    return (
      <p className="text-sm text-[var(--term-fg-dim)]">
        NO SELF-REQUESTABLE CLEARANCE AVAILABLE. LEVEL 4 AND ABOVE MUST BE
        ASSIGNED BY STAFF.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label className="block text-sm mb-1" htmlFor="requestedLevel">
          REQUESTED CLEARANCE
        </label>
        <select id="requestedLevel" name="requestedLevel" required className="term-input">
          {higherLevels.map((l) => (
            <option key={l.rank} value={l.rank}>
              {l.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm mb-1" htmlFor="reason">
          JUSTIFICATION
        </label>
        <textarea id="reason" name="reason" required rows={5} className="term-input resize-y" />
      </div>
      {state?.error && <p className="text-[var(--term-red)] text-sm">{state.error}</p>}
      <button type="submit" disabled={pending} className="term-button">
        {pending ? "SUBMITTING..." : "SUBMIT REQUEST"}
      </button>
    </form>
  );
}
