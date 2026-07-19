"use client";

import { useActionState } from "react";
import { submitBypassCodeAction } from "./actions";

export function BypassForm() {
  const [state, formAction, pending] = useActionState(
    submitBypassCodeAction,
    null
  );

  return (
    <form action={formAction} className="space-y-3">
      <label className="block text-sm" htmlFor="code">
        AUTHORIZED PERSONNEL — ENTER ACCESS CODE
      </label>
      <input
        id="code"
        name="code"
        required
        autoComplete="off"
        className="term-input"
        placeholder="ACCESS CODE"
      />
      {state?.error && (
        <p className="text-[var(--term-red)] text-sm">{state.error}</p>
      )}
      <button type="submit" disabled={pending} className="term-button w-full">
        {pending ? "VERIFYING..." : "ENTER"}
      </button>
    </form>
  );
}
