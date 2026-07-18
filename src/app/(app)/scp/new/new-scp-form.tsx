"use client";

import { useActionState } from "react";
import { createScpFileAction } from "../actions";
import { CLEARANCE_LEVELS } from "@/lib/clearance";

export function NewScpForm({ maxClearance }: { maxClearance: number }) {
  const [state, formAction, pending] = useActionState(createScpFileAction, null);
  const allowedLevels = CLEARANCE_LEVELS.filter((l) => l.rank <= maxClearance);

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label className="block text-sm mb-1" htmlFor="title">
          TITLE
        </label>
        <input id="title" name="title" required className="term-input" placeholder="SCP-XXXX" />
      </div>
      <div>
        <label className="block text-sm mb-1" htmlFor="clearanceRequired">
          CLEARANCE REQUIRED
        </label>
        <select id="clearanceRequired" name="clearanceRequired" required className="term-input">
          {allowedLevels.map((l) => (
            <option key={l.rank} value={l.rank}>
              {l.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm mb-1" htmlFor="body">
          BODY
        </label>
        <textarea id="body" name="body" required rows={14} className="term-input resize-y" />
        <p className="text-xs text-[var(--term-fg-dim)] mt-1">
          REDACTION: <code>[*text*]</code> hides text from everyone. <code>[*text*][4]</code>{" "}
          reveals it only to L-4 clearance or higher; lower levels see a redacted box.
        </p>
      </div>
      {state?.error && <p className="text-[var(--term-red)] text-sm">{state.error}</p>}
      <button type="submit" disabled={pending} className="term-button">
        {pending ? "FILING..." : "FILE RECORD"}
      </button>
    </form>
  );
}
