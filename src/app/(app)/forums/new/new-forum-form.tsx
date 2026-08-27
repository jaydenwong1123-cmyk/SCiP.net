"use client";

import { useActionState } from "react";
import { createForumAction } from "../actions";
import { CLEARANCE_LEVELS } from "@/lib/clearance";

export function NewForumForm({ maxClearance }: { maxClearance: number }) {
  const [state, formAction, pending] = useActionState(createForumAction, null);
  const options = CLEARANCE_LEVELS.filter((l) => l.rank <= maxClearance);

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label className="block text-sm mb-1" htmlFor="title">
          TITLE
        </label>
        <input id="title" name="title" required className="term-input" />
      </div>
      <div>
        <label className="block text-sm mb-1" htmlFor="description">
          DESCRIPTION <span className="text-[var(--term-fg-dim)]">(OPTIONAL)</span>
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          className="term-input resize-y"
        />
      </div>
      <div>
        <label className="block text-sm mb-1" htmlFor="minClearance">
          CLEARANCE REQUIRED TO POST
        </label>
        <select
          id="minClearance"
          name="minClearance"
          required
          defaultValue={options[0]?.rank}
          className="term-input"
        >
          {options.map((l) => (
            <option key={l.rank} value={l.rank}>
              {l.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-[var(--term-fg-dim)] mt-1">
          MEMBERS BELOW THIS CLEARANCE WILL NOT SEE THIS TOPIC EXISTS. CANNOT
          EXCEED YOUR OWN CLEARANCE.
        </p>
      </div>
      {state?.error && (
        <p className="text-[var(--term-red)] text-sm" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="term-button">
        {pending ? "OPENING..." : "OPEN FORUM"}
      </button>
    </form>
  );
}
