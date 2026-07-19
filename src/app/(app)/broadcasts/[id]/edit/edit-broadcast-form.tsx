"use client";

import { useActionState } from "react";
import Link from "next/link";
import { updateBroadcastAction } from "../../actions";

export function EditBroadcastForm({
  broadcast,
}: {
  broadcast: { id: string; title: string; body: string };
}) {
  const [state, formAction, pending] = useActionState(updateBroadcastAction, null);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={broadcast.id} />
      <div>
        <label className="block text-sm mb-1" htmlFor="title">
          TITLE
        </label>
        <input
          id="title"
          name="title"
          required
          defaultValue={broadcast.title}
          className="term-input"
        />
      </div>
      <div>
        <label className="block text-sm mb-1" htmlFor="body">
          BODY
        </label>
        <textarea
          id="body"
          name="body"
          required
          rows={12}
          defaultValue={broadcast.body}
          className="term-input resize-y"
        />
      </div>
      <div>
        <label className="block text-sm mb-1" htmlFor="reason">
          REVISION NOTE <span className="text-[var(--term-fg-dim)]">(OPTIONAL)</span>
        </label>
        <input
          id="reason"
          name="reason"
          maxLength={300}
          placeholder="WHY THIS DIRECTIVE WAS AMENDED"
          className="term-input"
        />
      </div>
      {state?.error && (
        <p className="text-[var(--term-red)] text-sm" role="alert">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="term-button">
          {pending ? "AMENDING..." : "SAVE REVISION"}
        </button>
        <Link href="/broadcasts" className="term-link text-sm">
          [CANCEL]
        </Link>
      </div>
    </form>
  );
}
