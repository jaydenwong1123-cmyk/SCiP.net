"use client";

import { useActionState, useEffect, useRef } from "react";
import { postForumMessageAction } from "./actions";

export function ForumPostForm({ forumId }: { forumId: string }) {
  const [state, formAction, pending] = useActionState(
    postForumMessageAction,
    null
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input type="hidden" name="forumId" value={forumId} />
      <label className="block text-xs text-[var(--term-fg-dim)]" htmlFor="body">
        &gt; POST TO THREAD
      </label>
      <textarea
        id="body"
        name="body"
        rows={3}
        placeholder="TYPE YOUR MESSAGE..."
        className="term-input resize-y"
      />
      {state?.error && (
        <p className="text-[var(--term-red)] text-sm" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="term-button text-sm">
        {pending ? "POSTING..." : "▲ POST"}
      </button>
    </form>
  );
}
