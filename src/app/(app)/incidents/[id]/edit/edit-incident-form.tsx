"use client";

import { useActionState, useRef } from "react";
import Link from "next/link";
import { FormatToolbar } from "@/components/format-toolbar";
import { updateIncidentReportAction } from "../../actions";
import { CLEARANCE_LEVELS } from "@/lib/clearance";
import { SEVERITIES } from "@/lib/incident";

export function EditIncidentForm({
  report,
  maxClearance,
}: {
  report: {
    id: string;
    title: string;
    location: string;
    body: string;
    severity: string;
    clearanceRequired: number;
  };
  maxClearance: number;
}) {
  const [state, formAction, pending] = useActionState(
    updateIncidentReportAction,
    null
  );
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const allowedLevels = CLEARANCE_LEVELS.filter((l) => l.rank <= maxClearance);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={report.id} />
      <div>
        <label className="block text-sm mb-1" htmlFor="title">
          TITLE
        </label>
        <input
          id="title"
          name="title"
          required
          defaultValue={report.title}
          className="term-input"
        />
      </div>
      <div>
        <label className="block text-sm mb-1" htmlFor="location">
          LOCATION
        </label>
        <input
          id="location"
          name="location"
          defaultValue={report.location}
          className="term-input"
        />
      </div>
      <div>
        <label className="block text-sm mb-1" htmlFor="severity">
          SEVERITY
        </label>
        <select
          id="severity"
          name="severity"
          required
          defaultValue={report.severity}
          className="term-input"
        >
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
          defaultValue={report.clearanceRequired}
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
          BODY
        </label>
        <FormatToolbar targetRef={bodyRef} />
        <textarea
          ref={bodyRef}
          id="body"
          name="body"
          required
          rows={16}
          defaultValue={report.body}
          className="term-input resize-y"
        />
      </div>
      <div>
        <label className="block text-sm mb-1" htmlFor="reason">
          REVISION NOTE <span className="text-[var(--term-fg-dim)]">(OPTIONAL)</span>
        </label>
        <input
          id="reason"
          name="reason"
          maxLength={300}
          placeholder="WHY THIS REPORT WAS AMENDED"
          className="term-input"
        />
      </div>
      {state?.error && (
        <p className="text-[var(--term-red)] text-sm" role="alert">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="term-button">
          {pending ? "AMENDING..." : "SAVE REVISION"}
        </button>
        <Link href={`/incidents/${report.id}`} className="term-link text-sm">
          [CANCEL]
        </Link>
      </div>
    </form>
  );
}
