import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import {
  dayKey,
  isNewSince,
  recentDayKeys,
  visitMarker,
  SESSION_GAP_MS,
} from "@/lib/activity";

const now = new Date("2026-11-13T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("visitMarker", () => {
  it("is null for a member with no visit on record", () => {
    expect(visitMarker({ id: "u", lastSeenAt: null, prevVisitAt: null }, now)).toBeNull();
  });

  it("uses the old lastSeenAt when a new session is starting", () => {
    const lastSeenAt = ago(SESSION_GAP_MS + 1000);
    const prevVisitAt = ago(10 * SESSION_GAP_MS);
    expect(visitMarker({ id: "u", lastSeenAt, prevVisitAt }, now)).toBe(lastSeenAt);
  });

  it("keeps the previous session's end while a session continues", () => {
    const lastSeenAt = ago(60 * 1000);
    const prevVisitAt = ago(10 * SESSION_GAP_MS);
    expect(visitMarker({ id: "u", lastSeenAt, prevVisitAt }, now)).toBe(prevVisitAt);
  });
});

describe("isNewSince", () => {
  it("is never new without a marker", () => {
    expect(isNewSince(now, null)).toBe(false);
  });

  it("compares against the marker", () => {
    expect(isNewSince(now, ago(1000))).toBe(true);
    expect(isNewSince(ago(2000), ago(1000))).toBe(false);
  });
});

describe("day keys", () => {
  it("formats a UTC day", () => {
    expect(dayKey(now)).toBe("2026-11-13");
  });

  it("lists recent days oldest first, ending today", () => {
    expect(recentDayKeys(3, now)).toEqual(["2026-11-11", "2026-11-12", "2026-11-13"]);
  });
});
