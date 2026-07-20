"use client";

import { useActionState, useRef } from "react";
import { replyToTicketAction } from "../actions";

export function ReplyForm({ ticketId }: { ticketId: string }) {
  const [state, formAction, pending] = useActionState(replyToTicketAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData: FormData) => {
        formAction(formData);
        // Clear the box so a sent reply doesn't sit there looking unsent.
        formRef.current?.reset();
      }}
      className="space-y-2 pt-2"
    >
      <input type="hidden" name="ticketId" value={ticketId} />
      <label className="block text-sm" htmlFor="body">
        ADD A REPLY
      </label>
      <textarea
        id="body"
        name="body"
        required
        rows={4}
        maxLength={5000}
        className="term-input resize-y"
      />
      {state?.error && (
        <p className="text-[var(--term-red)] text-sm">{state.error}</p>
      )}
      <button type="submit" disabled={pending} className="term-button text-xs">
        {pending ? "SENDING..." : "SEND REPLY"}
      </button>
    </form>
  );
}
