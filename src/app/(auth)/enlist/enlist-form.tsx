"use client";

import { useActionState } from "react";
import Link from "next/link";
import { enlistAction, type EnlistResult } from "./actions";
import { CI_EMAIL_DOMAIN } from "@/lib/ci/accounts";

const initialState: EnlistResult | null = null;

export function EnlistForm({ open }: { open: boolean }) {
  const [state, formAction, pending] = useActionState(enlistAction, initialState);

  return (
    <div className="term-panel ci-panel w-full space-y-4">
      <div className="hud-panel-head">
        <span className="hud-panel-head__code">CI</span>
        <span>CHAOS INSURGENCY // ENLISTMENT</span>
        <span className="hud-panel-head__status">{open ? "OOC CODE REQUIRED" : "CLOSED"}</span>
      </div>

      <p className="text-xs text-[var(--term-fg-dim)] leading-snug">
        [OOC] This creates a Chaos Insurgency operative account. It has no access to
        the Foundation network, only the CI field uplink. You need a one-use enlist
        code from the Engineer.
      </p>

      {!open ? (
        <p className="text-sm text-[var(--term-red)]">[OOC] CI SIGNUP IS CLOSED.</p>
      ) : state?.ok ? (
        <div className="space-y-3">
          <p className="text-[var(--term-red)]">
            OPERATIVE {state.codename} ENLISTED. RECORD YOUR CREDENTIALS — THE PASSWORD
            IS SHOWN ONLY ONCE.
          </p>
          <div className="term-panel space-y-1">
            <p>LOGIN: {state.email}</p>
            <p>PASSWORD: {state.password}</p>
          </div>
          <Link href="/login" className="term-button inline-block text-center w-full">
            PROCEED TO LOGIN
          </Link>
        </div>
      ) : (
        <form action={formAction} className="space-y-3">
          <div>
            <label className="block text-sm mb-1" htmlFor="username">
              CODENAME (login will be codename@{CI_EMAIL_DOMAIN})
            </label>
            <input
              id="username"
              name="username"
              required
              className="term-input"
              placeholder="redfox"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="block text-sm mb-1" htmlFor="code">
              [OOC] ENLIST CODE
            </label>
            <input
              id="code"
              name="code"
              type="password"
              required
              className="term-input"
              autoComplete="off"
            />
          </div>
          {state?.ok === false && (
            <p className="text-[var(--term-red)] text-sm">{state.error}</p>
          )}
          <button type="submit" disabled={pending} className="term-button w-full">
            {pending ? "PROCESSING..." : "ENLIST"}
          </button>
        </form>
      )}
    </div>
  );
}
