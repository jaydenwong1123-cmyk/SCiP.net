"use client";

import { useActionState, useState } from "react";
import { createTicketAction } from "../actions";
import { clearanceLabel } from "@/lib/clearance";
import {
  TICKET_TYPES,
  TICKET_TYPE_LABELS,
  TICKET_TYPE_DESCRIPTIONS,
  MIN_TICKET_GRANT_DAYS,
  MAX_TICKET_GRANT_DAYS,
  type TicketType,
} from "@/lib/tickets";

export function NewTicketForm({
  canRequestScp,
  scpFiles,
}: {
  canRequestScp: boolean;
  scpFiles: { id: string; title: string; clearanceRequired: number }[];
}) {
  const [state, formAction, pending] = useActionState(createTicketAction, null);
  const [type, setType] = useState<TicketType>(TICKET_TYPES.general);

  const types: TicketType[] = [TICKET_TYPES.general, TICKET_TYPES.bug];
  if (canRequestScp) types.push(TICKET_TYPES.scpAccess);

  const isScpRequest = type === TICKET_TYPES.scpAccess;

  return (
    <form action={formAction} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm mb-1">TICKET TYPE</legend>
        {types.map((t) => (
          <label key={t} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="type"
              value={t}
              checked={type === t}
              onChange={() => setType(t)}
              className="mt-1"
            />
            <span>
              <span className="text-[var(--term-fg-bright)]">
                {TICKET_TYPE_LABELS[t]}
              </span>
              <span className="block text-xs text-[var(--term-fg-dim)]">
                {TICKET_TYPE_DESCRIPTIONS[t]}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {isScpRequest && (
        <div className="space-y-3 border-l-2 border-[var(--term-border)]/40 pl-3">
          {scpFiles.length === 0 ? (
            <p className="text-sm text-[var(--term-fg-dim)]">
              NO SCP FILES SIT ABOVE YOUR CLEARANCE — NOTHING TO REQUEST.
            </p>
          ) : (
            <>
              <div>
                <label className="block text-sm mb-1" htmlFor="scpFileId">
                  SCP FILE
                </label>
                <select
                  id="scpFileId"
                  name="scpFileId"
                  required
                  className="term-input"
                >
                  <option value="">-- SELECT A FILE --</option>
                  {scpFiles.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.title} [{clearanceLabel(f.clearanceRequired)}]
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1" htmlFor="requestedDays">
                  ACCESS DURATION (DAYS)
                </label>
                <input
                  id="requestedDays"
                  type="number"
                  name="requestedDays"
                  min={MIN_TICKET_GRANT_DAYS}
                  max={MAX_TICKET_GRANT_DAYS}
                  defaultValue={7}
                  required
                  className="term-input w-24"
                />
              </div>
            </>
          )}
        </div>
      )}

      <div>
        <label className="block text-sm mb-1" htmlFor="subject">
          SUBJECT
        </label>
        <input
          id="subject"
          type="text"
          name="subject"
          required
          maxLength={200}
          className="term-input"
        />
      </div>

      <div>
        <label className="block text-sm mb-1" htmlFor="body">
          {isScpRequest ? "JUSTIFICATION" : "DETAILS"}
        </label>
        <textarea
          id="body"
          name="body"
          required
          rows={8}
          maxLength={5000}
          className="term-input resize-y"
        />
      </div>

      {state?.error && (
        <p className="text-[var(--term-red)] text-sm">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending || (isScpRequest && scpFiles.length === 0)}
        className="term-button"
      >
        {pending ? "SUBMITTING..." : "SUBMIT TICKET"}
      </button>
    </form>
  );
}
