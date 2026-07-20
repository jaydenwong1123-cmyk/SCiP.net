"use client";

import { useState } from "react";
import { CLEARANCE_LEVELS, clearanceLabel } from "@/lib/clearance";
import { renderRedacted } from "@/lib/redact";

// The SCP body field plus a redaction preview. A writer marks text up for a
// clearance they may not be able to un-see (staff and L-OMNI bypass redaction
// entirely), so the only way to check the markup actually hides what it should
// is to render it at an arbitrary rank. Safe to do client-side: the author is
// holding the full source text in the textarea either way.
export function BodyEditor({
  defaultValue = "",
  rows = 16,
}: {
  defaultValue?: string;
  rows?: number;
}) {
  const [body, setBody] = useState(defaultValue);
  const [previewRank, setPreviewRank] = useState<number | null>(null);

  return (
    <div>
      <label className="block text-sm mb-1" htmlFor="body">
        BODY
      </label>
      <textarea
        id="body"
        name="body"
        required
        rows={rows}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="term-input resize-y"
      />
      <p className="text-xs text-[var(--term-fg-dim)] mt-1">
        REDACTION: <code>[*text*]</code> hides text from everyone. <code>[*text*][4]</code>{" "}
        reveals it only to L-4 clearance or higher; lower levels see a redacted box.
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[var(--term-fg-dim)]">PREVIEW AS:</span>
        <select
          value={previewRank === null ? "" : String(previewRank)}
          onChange={(e) =>
            setPreviewRank(e.target.value === "" ? null : Number(e.target.value))
          }
          className="term-input py-1 text-xs w-auto"
          aria-label="Preview this record at a clearance level"
        >
          <option value="">— OFF —</option>
          {CLEARANCE_LEVELS.map((l) => (
            <option key={l.rank} value={l.rank}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      {previewRank !== null && (
        <div className="term-panel mt-2 text-sm">
          <p className="text-xs text-[var(--term-fg-dim)] mb-2">
            AS SEEN BY {clearanceLabel(previewRank)} PERSONNEL (NO BYPASS):
          </p>
          <div className="whitespace-pre-wrap">
            {body.trim() === "" ? (
              <span className="text-[var(--term-fg-dim)]">[EMPTY RECORD]</span>
            ) : (
              renderRedacted(body, previewRank)
            )}
          </div>
        </div>
      )}
    </div>
  );
}
