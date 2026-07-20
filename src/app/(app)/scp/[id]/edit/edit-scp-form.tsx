"use client";

import { useActionState } from "react";
import Link from "next/link";
import { updateScpFileAction } from "../../actions";
import { CLEARANCE_LEVELS } from "@/lib/clearance";
import { CLASSIFICATIONS } from "@/lib/classification";
import { BodyEditor } from "@/components/body-editor";

export function EditScpForm({
  file,
  maxClearance,
}: {
  file: {
    id: string;
    title: string;
    body: string;
    classification: string;
    clearanceRequired: number;
  };
  maxClearance: number;
}) {
  const [state, formAction, pending] = useActionState(updateScpFileAction, null);
  const allowedLevels = CLEARANCE_LEVELS.filter((l) => l.rank <= maxClearance);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={file.id} />
      <div>
        <label className="block text-sm mb-1" htmlFor="title">
          TITLE
        </label>
        <input
          id="title"
          name="title"
          required
          defaultValue={file.title}
          className="term-input"
        />
      </div>
      <div>
        <label className="block text-sm mb-1" htmlFor="classification">
          OBJECT CLASS
        </label>
        <select
          id="classification"
          name="classification"
          required
          defaultValue={file.classification}
          className="term-input"
        >
          {CLASSIFICATIONS.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm mb-1" htmlFor="clearanceRequired">
          CLEARANCE REQUIRED
        </label>
        <select
          id="clearanceRequired"
          name="clearanceRequired"
          required
          defaultValue={file.clearanceRequired}
          className="term-input"
        >
          {allowedLevels.map((l) => (
            <option key={l.rank} value={l.rank}>
              {l.label}
            </option>
          ))}
        </select>
      </div>
      <BodyEditor defaultValue={file.body} />
      <div>
        <label className="block text-sm mb-1" htmlFor="reason">
          REVISION NOTE <span className="text-[var(--term-fg-dim)]">(OPTIONAL)</span>
        </label>
        <input
          id="reason"
          name="reason"
          maxLength={300}
          placeholder="WHY THIS DOCUMENT WAS AMENDED"
          className="term-input"
        />
        <p className="text-xs text-[var(--term-fg-dim)] mt-1">
          SHOWN IN THE REVISION HISTORY ALONGSIDE YOUR NAME.
        </p>
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
        <Link href={`/scp/${file.id}`} className="term-link text-sm">
          [CANCEL]
        </Link>
      </div>
    </form>
  );
}
