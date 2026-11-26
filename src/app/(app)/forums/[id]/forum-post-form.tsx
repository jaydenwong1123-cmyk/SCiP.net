"use client";

import { useActionState, useEffect, useRef } from "react";
import { postForumMessageAction } from "./actions";

// The reply box's textarea, addressed by id so a post's [REPLY] button can
// drop an @mention into it from elsewhere on the page.
export const FORUM_BODY_ID = "forum-body";

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
      <label
        className="block text-xs text-[var(--term-fg-dim)]"
        htmlFor={FORUM_BODY_ID}
      >
        &gt; POST TO THREAD
      </label>
      <textarea
        id={FORUM_BODY_ID}
        name="body"
        rows={3}
        placeholder="TYPE YOUR MESSAGE..."
        className="term-input resize-y"
      />
      <p className="text-[10px] text-[var(--term-fg-dim)]">
        @DISPLAY NAME NOTIFIES THAT MEMBER · SCP-XXXX LINKS THE FILE ·
        EVERYONE IN THE THREAD IS ALERTED TO YOUR REPLY
      </p>
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
