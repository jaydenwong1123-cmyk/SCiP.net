"use client";

import { useActionState } from "react";
import { createBroadcastAction } from "./actions";

export function BroadcastForm() {
  const [state, formAction, pending] = useActionState(createBroadcastAction, null);

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label className="block text-sm mb-1" htmlFor="title">
          TITLE
        </label>
        <input id="title" name="title" required className="term-input" />
      </div>
      <div>
        <label className="block text-sm mb-1" htmlFor="body">
          MESSAGE
        </label>
        <textarea id="body" name="body" required rows={6} className="term-input resize-y" />
      </div>
      {state?.error && <p className="text-[var(--term-red)] text-sm">{state.error}</p>}
      <button type="submit" disabled={pending} className="term-button">
        {pending ? "BROADCASTING..." : "BROADCAST"}
      </button>
    </form>
  );
}
