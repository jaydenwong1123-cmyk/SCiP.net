"use client";

import { useActionState } from "react";
import { sendMessageAction } from "../actions";

export function ComposeForm({
  recipients,
  defaultRecipientId = "",
  defaultSubject = "",
}: {
  recipients: { id: string; displayName: string | null }[];
  defaultRecipientId?: string;
  defaultSubject?: string;
}) {
  const [state, formAction, pending] = useActionState(sendMessageAction, null);

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label className="block text-sm mb-1" htmlFor="recipientId">
          TO
        </label>
        <select
          id="recipientId"
          name="recipientId"
          required
          defaultValue={defaultRecipientId}
          className="term-input"
        >
          <option value="">-- SELECT RECIPIENT --</option>
          {recipients.map((r) => (
            <option key={r.id} value={r.id}>
              {r.displayName}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm mb-1" htmlFor="subject">
          SUBJECT
        </label>
        <input
          id="subject"
          name="subject"
          required
          defaultValue={defaultSubject}
          className="term-input"
        />
      </div>
      <div>
        <label className="block text-sm mb-1" htmlFor="body">
          MESSAGE
        </label>
        <textarea id="body" name="body" required rows={10} className="term-input resize-y" />
      </div>
      {state?.error && <p className="text-[var(--term-red)] text-sm">{state.error}</p>}
      <button type="submit" disabled={pending} className="term-button">
        {pending ? "SENDING..." : "SEND"}
      </button>
    </form>
  );
}
