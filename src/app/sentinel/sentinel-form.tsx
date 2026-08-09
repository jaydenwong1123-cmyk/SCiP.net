"use client";

import { useActionState } from "react";
import { submitSentinelAction } from "./actions";

export function SentinelForm({ question }: { question: string }) {
  const [state, formAction, pending] = useActionState(
    submitSentinelAction,
    null
  );

  return (
    <form action={formAction} className="space-y-3">
      <label className="block text-sm text-[var(--term-amber)]" htmlFor="answer">
        {question}
      </label>
      <input
        id="answer"
        name="answer"
        required
        autoFocus
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        className="term-input"
        placeholder="RESPONSE"
      />
      {state?.error && (
        <p className="text-[var(--term-red)] text-sm">{state.error}</p>
      )}
      <button type="submit" disabled={pending} className="term-button w-full">
        {pending ? "VERIFYING..." : "RESPOND"}
      </button>
    </form>
  );
}
