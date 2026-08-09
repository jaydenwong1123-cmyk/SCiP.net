"use client";

import { useActionState } from "react";
import { restoreSiteAction } from "./actions";
import type { OmegaState } from "./actions";

// Lifting a termination is not armed or delayed — a delay exists to give the
// operator a moment to reconsider destroying something, and there is nothing
// destructive about turning the lights back on. The three credential factors
// still apply, because the site's posture is not a half-authenticated decision.
export function RestoreConsole() {
  const [state, formAction, pending] = useActionState<OmegaState, FormData>(
    restoreSiteAction,
    null
  );

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-sm">
        THE NETWORK IS DARK TO ALL PERSONNEL. RESTORING RETURNS EVERY ROUTE TO
        NORMAL ACCESS IMMEDIATELY.
      </p>
      <div>
        <label className="block text-sm mb-1" htmlFor="restore-password">
          ACCOUNT PASSWORD
        </label>
        <input
          id="restore-password"
          name="password"
          type="password"
          required
          autoComplete="off"
          className="term-input"
        />
      </div>
      <div>
        <label className="block text-sm mb-1" htmlFor="restore-key">
          OMEGA KEY
        </label>
        <input
          id="restore-key"
          name="omegaKey"
          type="password"
          required
          autoComplete="off"
          className="term-input"
        />
      </div>
      <div>
        <label className="block text-sm mb-1" htmlFor="restore-phrase">
          TYPE <span className="text-[var(--term-amber)]">TERMINATE SCIP.NET</span>
        </label>
        <input
          id="restore-phrase"
          name="phrase"
          required
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="term-input"
        />
      </div>
      {state?.error && (
        <p className="text-[var(--term-red)] text-sm">{state.error}</p>
      )}
      {state?.message && (
        <p className="text-[var(--term-amber)] text-sm">{state.message}</p>
      )}
      <button type="submit" disabled={pending} className="term-button w-full">
        {pending ? "RESTORING..." : "RESTORE NETWORK"}
      </button>
    </form>
  );
}
