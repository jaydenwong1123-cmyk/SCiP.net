"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { markAllNotificationsReadAction } from "@/lib/notification-actions";

export type NotificationRow = {
  id: string;
  body: string;
  link: string;
  read: boolean;
  createdAt: string;
};

export function NotificationBell({
  notifications,
  unreadCount,
}: {
  notifications: NotificationRow[];
  unreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  function toggle() {
    setOpen((wasOpen) => {
      const next = !wasOpen;
      if (next && unreadCount > 0) {
        startTransition(() => {
          void markAllNotificationsReadAction();
        });
      }
      return next;
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        className="term-link text-[var(--term-fg-bright)]"
        aria-label={`${unreadCount} unread ${
          unreadCount === 1 ? "notification" : "notifications"
        }`}
      >
        🔔 {unreadCount > 0 ? `${unreadCount} NEW` : "ALERTS"}
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-72 term-panel z-50 max-h-80 overflow-y-auto text-xs"
          onMouseLeave={() => setOpen(false)}
        >
          {notifications.length === 0 && (
            <p className="text-[var(--term-fg-dim)] p-2">NO NOTIFICATIONS.</p>
          )}
          {notifications.map((n) => (
            <Link
              key={n.id}
              href={n.link}
              onClick={() => setOpen(false)}
              className="block border-b border-[var(--term-border)]/30 py-2 px-2 term-link"
              style={!n.read ? { color: "var(--term-fg-bright)" } : undefined}
            >
              <div className="break-words">{n.body}</div>
              <div className="text-[var(--term-fg-dim)] mt-1">{n.createdAt}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
