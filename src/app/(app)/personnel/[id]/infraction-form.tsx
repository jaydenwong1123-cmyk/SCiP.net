"use client";

import { useActionState, useEffect, useRef } from "react";
import { addInfractionAction } from "../actions";
import { INFRACTION_SEVERITIES } from "@/lib/infractions";

export function InfractionForm({ subjectId }: { subjectId: string }) {
  const [state, formAction, pending] = useActionState(addInfractionAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input type="hidden" name="subjectId" value={subjectId} />
      <div className="flex items-center gap-2">
        <label className="text-xs text-[var(--term-fg-dim)]" htmlFor="severity">
          SEVERITY
        </label>
        <select id="severity" name="severity" required className="term-input text-xs w-auto">
          {INFRACTION_SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <textarea
        name="reason"
        required
        rows={3}
        maxLength={2000}
        placeholder="Describe the infraction..."
        className="term-input resize-y"
      />
      {state?.error && (
        <p className="text-[var(--term-red)] text-sm" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="term-button text-xs">
        {pending ? "FILING..." : "FILE INFRACTION"}
      </button>
    </form>
  );
}
