"use client";

import { useState, useTransition } from "react";
import { toggleMuteAction, toggleSilentAction } from "@/lib/notification-actions";
import type { NotificationType } from "@/lib/notifications";

const TYPE_LABELS: Record<NotificationType, string> = {
  message: "DIRECT MESSAGES",
  mention: "MENTIONS",
  infraction: "INFRACTIONS",
  ticket: "TICKETS",
  intrusion: "INTRUSION ALERTS",
};

export function NotificationPreferencesForm({
  preferences,
}: {
  preferences: { type: NotificationType; muted: boolean; silenced: boolean }[];
}) {
  const [rows, setRows] = useState(preferences);
  const [, startTransition] = useTransition();

  function toggleMute(type: NotificationType) {
    setRows((prev) =>
      prev.map((row) => (row.type === type ? { ...row, muted: !row.muted } : row)),
    );
    startTransition(() => {
      void toggleMuteAction(type);
    });
  }

  function toggleSilent(type: NotificationType) {
    setRows((prev) =>
      prev.map((row) => (row.type === type ? { ...row, silenced: !row.silenced } : row)),
    );
    startTransition(() => {
      void toggleSilentAction(type);
    });
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div
          key={row.type}
          className="flex items-center justify-between gap-3 border border-[var(--term-border)]/40 rounded px-3 py-2"
        >
          <span className="text-xs">{TYPE_LABELS[row.type]}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => toggleMute(row.type)}
              aria-pressed={row.muted}
              disabled={row.silenced}
              className="term-button text-xs disabled:opacity-40"
              style={{
                borderColor: row.muted ? "var(--term-fg-bright)" : "var(--term-border)",
                boxShadow: row.muted ? "0 0 8px rgba(var(--term-glow-rgb), 0.4)" : "none",
              }}
              title="Still logged in your history, but no badge or ping."
            >
              {row.muted ? "[MUTED]" : "MUTE"}
            </button>
            <button
              type="button"
              onClick={() => toggleSilent(row.type)}
              aria-pressed={row.silenced}
              className="term-button text-xs"
              style={{
                borderColor: row.silenced ? "var(--term-amber)" : "var(--term-border)",
                boxShadow: row.silenced ? "0 0 8px rgba(var(--term-glow-rgb), 0.4)" : "none",
              }}
              title="Never generated or logged at all, until turned off."
            >
              {row.silenced ? "[SILENCED]" : "SILENCE"}
            </button>
          </div>
        </div>
      ))}
      <p className="text-xs text-[var(--term-fg-dim)] mt-2">
        MUTE STILL LOGS THE ALERT WITHOUT PINGING YOU. SILENCE STOPS IT FROM BEING
        RECORDED AT ALL.
      </p>
    </div>
  );
}
