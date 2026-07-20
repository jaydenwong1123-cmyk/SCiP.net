"use client";

import { useActionState } from "react";
import { createScpFileAction } from "../actions";
import { CLEARANCE_LEVELS } from "@/lib/clearance";
import { CLASSIFICATIONS } from "@/lib/classification";
import { BodyEditor } from "@/components/body-editor";

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
        <label className="block text-sm mb-1" htmlFor="classification">
          OBJECT CLASS
        </label>
        <select id="classification" name="classification" required className="term-input">
          {CLASSIFICATIONS.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
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
      <BodyEditor rows={14} />
      {state?.error && <p className="text-[var(--term-red)] text-sm">{state.error}</p>}
      <button type="submit" disabled={pending} className="term-button">
        {pending ? "FILING..." : "FILE RECORD"}
      </button>
    </form>
  );
}
