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

// How often an open, visible tab asks for new alerts.
const POLL_MS = 60 * 1000;

export function NotificationBell({
  notifications,
  unreadCount,
}: {
  notifications: NotificationRow[];
  unreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState(notifications);
  const [localUnreadCount, setLocalUnreadCount] = useState(unreadCount);
  const [, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  // A navigation re-renders the layout with fresh values; those win over
  // whatever the last poll left here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows(notifications);
    setLocalUnreadCount(unreadCount);
  }, [notifications, unreadCount]);

  // Live updates. Polls only while the tab is visible, and once more the
  // moment it becomes visible again, so a tab left in the background costs
  // nothing and still shows the right count when the member comes back to it.
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/notifications", { cache: "no-store" });
        // 204 (signed out / nothing to say) and a redirect to the login page
        // both mean "leave the bell as it is".
        if (cancelled || res.status !== 200 || res.redirected) return;
        const data: { unread: number; notifications: NotificationRow[] } =
          await res.json();
        if (cancelled) return;
        setRows(data.notifications);
        setLocalUnreadCount(data.unread);
      } catch {
        // Offline or mid-deploy: try again on the next tick.
      }
    }

    const timer = window.setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, []);

  // Click outside the dropdown, or Escape, closes it. There is no timer-based
  // auto-close — alerts stay open until the user explicitly dismisses them.
  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const visibleNotifications = rows.filter((n) => !dismissedIds.has(n.id));

  function handleNotificationClick(n: NotificationRow) {
    setDismissedIds((prev) => new Set(prev).add(n.id));
    setOpen(false);
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
        aria-expanded={open}
        aria-label={`${localUnreadCount} unread ${
          localUnreadCount === 1 ? "notification" : "notifications"
        }`}
      >
        ALERTS
        {localUnreadCount > 0 && (
          <span
            className="absolute -top-2 -right-2 bg-[var(--term-amber)] text-[var(--term-bg)] text-[10px] leading-none min-w-[14px] h-[14px] px-[3px] flex items-center justify-center"
            aria-hidden
          >
            {localUnreadCount > 99 ? "99+" : localUnreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 term-panel z-50 max-h-80 overflow-y-auto text-xs bg-[var(--term-bg)]">
          <div className="hud-panel-head">
            <span className="hud-panel-head__code">ALERTS</span>
            <span className="hud-panel-head__status">
              {localUnreadCount > 0 ? `${localUnreadCount} UNREAD` : "ALL READ"}
            </span>
          </div>
          {visibleNotifications.length === 0 && (
            <p className="text-[var(--term-fg-dim)] p-2">NO NOTIFICATIONS.</p>
          )}
          <div className="hud-list">
            {visibleNotifications.map((n) => (
              <Link
                key={n.id}
                href={n.link}
                onClick={() => handleNotificationClick(n)}
                className="block py-2 px-2 no-underline"
                style={!n.read ? { color: "var(--term-fg-bright)" } : undefined}
              >
                <div className="break-words">{n.body}</div>
                <div className="hud-recid mt-1">{n.createdAt}</div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
