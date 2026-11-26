"use client";

import { useActionState, useEffect, useRef } from "react";
import { editForumPostAction } from "./actions";
import { FORUM_BODY_ID } from "./forum-post-form";

// Starts a reply to one member: puts "@Name " at the end of the reply box and
// moves the cursor there. The mention is what notifies them once posted.
//
// It deliberately does not quote the post. Quoting would copy text the viewer
// can read into a new post without its redaction markup, where members below
// that clearance could then read it too.
export function ReplyButton({ name }: { name: string }) {
  function reply() {
    const box = document.getElementById(FORUM_BODY_ID);
    if (!(box instanceof HTMLTextAreaElement)) return;
    const mention = `@${name} `;
    const current = box.value;
    box.value =
      current && !current.endsWith(" ") && !current.endsWith("\n")
        ? `${current} ${mention}`
        : `${current}${mention}`;
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
    box.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  return (
    <button
      type="button"
      onClick={reply}
      className="term-link cursor-pointer bg-transparent border-none p-0 text-xs"
    >
      [REPLY]
    </button>
  );
}

// Inline editor for the author's own post, folded away until opened.
export function EditPostForm({ id, body }: { id: string; body: string }) {
  const [state, formAction, pending] = useActionState(editForumPostAction, null);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (state?.ok && detailsRef.current) detailsRef.current.open = false;
  }, [state]);

  return (
    <details ref={detailsRef} className="text-xs">
      <summary className="term-link cursor-pointer inline">[EDIT]</summary>
      <form action={formAction} className="space-y-2 mt-2">
        <input type="hidden" name="id" value={id} />
        <textarea
          name="body"
          rows={4}
          defaultValue={body}
          aria-label="Edit your post"
          className="term-input resize-y"
        />
        {state?.error && (
          <p className="text-[var(--term-red)] text-sm" role="alert">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="term-button term-button--sm"
        >
          {pending ? "SAVING..." : "SAVE AMENDMENT"}
        </button>
      </form>
    </details>
  );
}
