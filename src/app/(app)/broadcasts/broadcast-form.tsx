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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm mb-1" htmlFor="publishAt">
            PUBLISH AT{" "}
            <span className="text-[var(--term-fg-dim)]">(BLANK = NOW)</span>
          </label>
          <input
            id="publishAt"
            name="publishAt"
            type="datetime-local"
            className="term-input"
          />
        </div>
        <div>
          <label className="block text-sm mb-1" htmlFor="expiresAt">
            STAND DOWN AT{" "}
            <span className="text-[var(--term-fg-dim)]">(BLANK = NEVER)</span>
          </label>
          <input
            id="expiresAt"
            name="expiresAt"
            type="datetime-local"
            className="term-input"
          />
        </div>
      </div>
      <p className="text-xs text-[var(--term-fg-dim)]">
        A SCHEDULED DIRECTIVE STAYS HIDDEN UNTIL ITS PUBLISH TIME AND
        DISAPPEARS ON ITS STAND-DOWN TIME. TIMES ARE UTC.
      </p>
      {state?.error && (
        <p className="text-[var(--term-red)] text-sm" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="term-button">
        {pending ? "BROADCASTING..." : "BROADCAST"}
      </button>
    </form>
  );
}
