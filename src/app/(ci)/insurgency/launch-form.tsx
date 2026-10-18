"use client";

import { useActionState } from "react";
import { launchSiegeAction } from "./actions";
import type { LaunchResult } from "@/lib/ci/siege-store";

export function LaunchForm({ durations, disabled }: { durations: readonly number[]; disabled: boolean }) {
  const [state, formAction, pending] = useActionState<LaunchResult | null, FormData>(
    launchSiegeAction,
    null
  );

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label className="block text-sm mb-1" htmlFor="code">
          [OOC] LAUNCH CODE
        </label>
        <input
          id="code"
          name="code"
          type="password"
          required
          className="term-input"
          autoComplete="off"
          disabled={disabled}
        />
      </div>
      <div>
        <label className="block text-sm mb-1" htmlFor="minutes">
          SIEGE LENGTH
        </label>
        <select id="minutes" name="minutes" className="term-input" disabled={disabled}>
          {durations.map((m) => (
            <option key={m} value={m}>
              {m} MIN
            </option>
          ))}
        </select>
      </div>
      {state?.ok === false && <p className="text-sm text-[var(--term-red)]">{state.error}</p>}
      {state?.ok && <p className="text-sm text-[var(--term-fg-bright)]">SIEGE LAUNCHED. GO.</p>}
      <button type="submit" className="term-button w-full" disabled={pending || disabled}>
        {pending ? "TRANSMITTING..." : "[LAUNCH SIEGE]"}
      </button>
    </form>
  );
}
