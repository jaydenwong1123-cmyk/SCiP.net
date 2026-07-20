"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { markNotificationReadAction } from "@/lib/notification-actions";

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
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [localUnreadCount, setLocalUnreadCount] = useState(unreadCount);
  const [, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  // Click outside the dropdown closes it. There is no timer-based auto-close —
  // alerts stay open until the user explicitly dismisses them.
  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const visibleNotifications = notifications.filter((n) => !dismissedIds.has(n.id));

  function handleNotificationClick(n: NotificationRow) {
    setDismissedIds((prev) => new Set(prev).add(n.id));
    if (!n.read) {
      setLocalUnreadCount((count) => Math.max(0, count - 1));
      startTransition(() => {
        void markNotificationReadAction(n.id);
      });
    }
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className="term-link text-[var(--term-fg-bright)] relative inline-block pr-1"
        aria-label={`${localUnreadCount} unread ${
          localUnreadCount === 1 ? "notification" : "notifications"
        }`}
      >
        ALERTS
        {localUnreadCount > 0 && (
          <span
            className="absolute -top-2 -right-2 rounded-full bg-[var(--term-amber)] text-[var(--term-bg)] text-[10px] leading-none min-w-[14px] h-[14px] px-[3px] flex items-center justify-center"
            aria-hidden
          >
            {localUnreadCount > 99 ? "99+" : localUnreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 term-panel z-50 max-h-80 overflow-y-auto text-xs">
          {visibleNotifications.length === 0 && (
            <p className="text-[var(--term-fg-dim)] p-2">NO NOTIFICATIONS.</p>
          )}
          {visibleNotifications.map((n) => (
            <Link
              key={n.id}
              href={n.link}
              onClick={() => handleNotificationClick(n)}
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
