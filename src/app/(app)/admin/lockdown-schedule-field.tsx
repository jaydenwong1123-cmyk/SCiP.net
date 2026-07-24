"use client";

import { useState } from "react";

// datetime-local wants a "YYYY-MM-DDTHH:mm" string in the *browser's* local
// time. The server only knows the absolute instant, so we convert here — this
// way the prefilled value and the countdown agree regardless of where the
// server runs.
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

export function LockdownScheduleField({
  defaultIso,
}: {
  defaultIso: string | null;
}) {
  const [value, setValue] = useState(() => toLocalInput(defaultIso));

  return (
    <div>
      <label
        className="block text-xs text-[var(--term-fg-dim)] mb-1"
        htmlFor="lockdownUntil"
      >
        AUTO-UNLOCK AT (OPTIONAL — BLANK = UNTIL TURNED OFF)
      </label>
      <div className="flex items-center gap-2">
        <input
          id="lockdownUntil"
          name="lockdownUntil"
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="term-input py-1 w-64"
        />
        {value && (
          <button
            type="button"
            onClick={() => setValue("")}
            className="term-button text-xs"
          >
            CLEAR
          </button>
        )}
      </div>
      <p className="text-[10px] text-[var(--term-fg-dim)] mt-1">
        A public countdown is shown to visitors and the site unlocks itself when
        it reaches zero.
      </p>
    </div>
  );
}
