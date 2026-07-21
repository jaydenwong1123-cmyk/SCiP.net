"use client";

import { useActionState } from "react";
import { setNameAction } from "../actions";

export function SetNameForm() {
  const [state, formAction, pending] = useActionState(setNameAction, null);

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label className="block text-sm mb-1" htmlFor="displayName">
          DISPLAY NAME
        </label>
        <input
          id="displayName"
          name="displayName"
          required
          className="term-input"
          placeholder="L. Cheung"
          autoComplete="off"
          maxLength={80}
        />
        <p className="text-xs text-[var(--term-fg-dim)] mt-1">
          REDACTION: <code>[*text*]</code> hides part of your name;{" "}
          <code>[*text*][4]</code> reveals it only to L-4 and above.
        </p>
      </div>
      {state?.error && <p className="text-[var(--term-red)] text-sm">{state.error}</p>}
      <button type="submit" disabled={pending} className="term-button w-full">
        {pending ? "SAVING..." : "CONFIRM IDENTITY"}
      </button>
    </form>
  );
}
