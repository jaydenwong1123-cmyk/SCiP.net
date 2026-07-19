import type { Prisma } from "@prisma/client";

// Scheduling window for broadcasts.
//
// Visibility is computed at query time rather than by a background job: a
// directive becomes live and later stands down on its own, with nothing
// needing to run on a schedule. This deployment has no cron, so anything
// job-based would silently never fire.

export type ScheduleState = "live" | "scheduled" | "expired";

export function scheduleState(
  broadcast: { publishAt: Date | null; expiresAt: Date | null },
  now = new Date()
): ScheduleState {
  if (broadcast.publishAt && broadcast.publishAt.getTime() > now.getTime()) {
    return "scheduled";
  }
  if (broadcast.expiresAt && broadcast.expiresAt.getTime() <= now.getTime()) {
    return "expired";
  }
  return "live";
}

// Prisma filter matching only currently-live directives: published (or with no
// publish time) and not yet expired (or with no expiry).
export function liveBroadcastWhere(now = new Date()): Prisma.BroadcastWhereInput {
  return {
    AND: [
      { OR: [{ publishAt: null }, { publishAt: { lte: now } }] },
      { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    ],
  };
}

// Parse a datetime-local form value ("2026-07-19T14:30") into a Date.
// Returns null for blank input and undefined for malformed input, so callers
// can tell "clear this field" apart from "reject this submission".
export function parseScheduleInput(
  raw: FormDataEntryValue | null
): Date | null | undefined {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

// Format a Date back into the value a datetime-local input expects.
export function toLocalInputValue(date: Date | null): string {
  if (!date) return "";
  // datetime-local has no timezone, so emit the ISO form trimmed to minutes.
  return date.toISOString().slice(0, 16);
}

export function formatStamp(date: Date): string {
  return date.toISOString().slice(0, 16).replace("T", " ");
}
