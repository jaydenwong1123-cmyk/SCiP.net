"use client";

import { useActionState, useRef } from "react";
import { createIncidentReportAction } from "../actions";
import { FormatToolbar } from "@/components/format-toolbar";
import { CLEARANCE_LEVELS } from "@/lib/clearance";
import { SEVERITIES } from "@/lib/incident";

export function NewIncidentForm({ maxClearance }: { maxClearance: number }) {
  const [state, formAction, pending] = useActionState(
    createIncidentReportAction,
    null
  );
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const allowedLevels = CLEARANCE_LEVELS.filter((l) => l.rank <= maxClearance);

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label className="block text-sm mb-1" htmlFor="title">
          TITLE
        </label>
        <input
          id="title"
          name="title"
          required
          className="term-input"
          placeholder="INCIDENT-XXXX"
        />
      </div>
      <div>
        <label className="block text-sm mb-1" htmlFor="location">
          LOCATION / SITE
        </label>
        <input
          id="location"
          name="location"
          className="term-input"
          placeholder="SITE-19, SECTOR C"
        />
      </div>
      <div>
        <label className="block text-sm mb-1" htmlFor="severity">
          SEVERITY
        </label>
        <select id="severity" name="severity" required className="term-input">
          {SEVERITIES.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm mb-1" htmlFor="clearanceRequired">
          CLEARANCE REQUIRED
        </label>
        <select
          id="clearanceRequired"
          name="clearanceRequired"
          required
          className="term-input"
        >
          {allowedLevels.map((l) => (
            <option key={l.rank} value={l.rank}>
              {l.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm mb-1" htmlFor="body">
          REPORT
        </label>
        <FormatToolbar targetRef={bodyRef} />
        <textarea
          ref={bodyRef}
          id="body"
          name="body"
          required
          rows={14}
          className="term-input resize-y"
        />
        <p className="text-xs text-[var(--term-fg-dim)] mt-1">
          REDACTION: <code>[*text*]</code> hides text from everyone.{" "}
          <code>[*text*][4]</code> reveals it only to L-4 clearance or higher.
        </p>
      </div>
      {state?.error && (
        <p className="text-[var(--term-red)] text-sm">{state.error}</p>
      )}
      <button type="submit" disabled={pending} className="term-button">
        {pending ? "FILING..." : "FILE REPORT"}
      </button>
    </form>
  );
}
