"use client";

import { useActionState, useState } from "react";
import { issueSanctionAction, liftSanctionAction } from "./actions";
import {
  SANCTION_ORDER,
  SANCTION_LABELS,
  SANCTION_BLURBS,
  SANCTION_LEVELS,
  MIN_SANCTION_DAYS,
  MAX_SANCTION_DAYS,
  type SanctionLevel,
} from "@/lib/hack/sanctions";

export type SanctionRow = {
  id: string;
  level: string;
  reason: string;
  memberId: string;
  memberName: string;
  issuedByName: string;
  createdAtLabel: string;
  expiresAtLabel: string | null;
  liftedAtLabel: string | null;
  active: boolean;
};

// Issue a sanction against one member.
//
// The member is chosen from a list rather than typed: this form takes an action
// against a named person, and a free-text id field is how the wrong person gets
// sanctioned by a paste error.
export function IssueSanctionForm({
  members,
  suggestedLevel,
}: {
  members: { id: string; name: string }[];
  suggestedLevel: SanctionLevel;
}) {
  const [state, formAction, pending] = useActionState(
    issueSanctionAction,
    null
  );
  const [level, setLevel] = useState<SanctionLevel>(suggestedLevel);
  const [indefinite, setIndefinite] = useState(false);

  const canBeIndefinite = level === SANCTION_LEVELS.blacklisted;

  return (
    <form action={formAction} className="space-y-3 p-1">
      <label className="block text-sm">
        <span className="hud-readout__label block mb-1">MEMBER</span>
        <select name="userId" required className="term-input w-full">
          <option value="">— SELECT —</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="space-y-1">
        <legend className="hud-readout__label mb-1">STEP</legend>
        {SANCTION_ORDER.map((l) => (
          <label key={l} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="level"
              value={l}
              checked={level === l}
              onChange={() => {
                setLevel(l);
                if (l !== SANCTION_LEVELS.blacklisted) setIndefinite(false);
              }}
              className="mt-1"
            />
            <span>
              <span className="text-[var(--term-fg-bright)]">
                {SANCTION_LABELS[l]}
              </span>
              <span className="block text-xs text-[var(--term-fg-dim)]">
                {SANCTION_BLURBS[l]}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <label className="block text-sm">
        <span className="hud-readout__label block mb-1">
          REASON — SHOWN TO THE MEMBER
        </span>
        <textarea
          name="reason"
          required
          rows={2}
          maxLength={400}
          className="term-input w-full"
          placeholder="WHY THIS STEP IS BEING TAKEN"
        />
      </label>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="hud-readout__label block mb-1">DURATION (DAYS)</span>
          <input
            type="number"
            name="days"
            min={MIN_SANCTION_DAYS}
            max={MAX_SANCTION_DAYS}
            defaultValue={7}
            disabled={indefinite}
            className="term-input w-28"
          />
        </label>
        {canBeIndefinite && (
          <label className="flex items-center gap-2 text-sm pb-2">
            <input
              type="checkbox"
              name="indefinite"
              checked={indefinite}
              onChange={(e) => setIndefinite(e.target.checked)}
            />
            <span className="text-[var(--term-red)]">NO EXPIRY</span>
          </label>
        )}
      </div>

      {state?.error && (
        <p className="text-sm text-[var(--term-red)]">{state.error}</p>
      )}
      {state?.ok && (
        <p className="text-sm text-[var(--term-fg-bright)]">
          SANCTION RECORDED — THE MEMBER HAS BEEN NOTIFIED.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="term-button term-button--danger"
      >
        {pending ? "ISSUING..." : "[ISSUE SANCTION]"}
      </button>
    </form>
  );
}

/** Lift one sanction early — the action an upheld appeal ends in. */
export function LiftSanctionForm({ sanctionId }: { sanctionId: string }) {
  const [state, formAction, pending] = useActionState(liftSanctionAction, null);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2 pt-1">
      <input type="hidden" name="sanctionId" value={sanctionId} />
      <input
        type="text"
        name="liftReason"
        maxLength={400}
        placeholder="REASON (E.G. APPEAL UPHELD)"
        className="term-input flex-1 min-w-[14rem] text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        className="term-button term-button--sm term-button--ghost"
      >
        {pending ? "LIFTING..." : "[LIFT]"}
      </button>
      {state?.error && (
        <span className="text-xs text-[var(--term-red)]">{state.error}</span>
      )}
    </form>
  );
}
