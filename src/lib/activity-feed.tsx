import type { ReactNode } from "react";
import { db } from "@/lib/db";
import { authoringClearance } from "@/lib/clearance";
import {
  renderRedacted,
  renderRedactedName,
  canBypassRedaction,
} from "@/lib/redact";
import { liveBroadcastWhere } from "@/lib/broadcast-schedule";

// The station board's "latest activity" list: the newest records across the
// archive, the incident log, the broadcasts and the forums, merged by time.
//
// EVERY QUERY HERE REPEATS ITS OWN STATION'S VISIBILITY RULE. This list is a
// second door into four sections, and a record the viewer could not see on the
// section's own page must not be visible, countable or inferable from here:
//
//   SCP files   clearance at or below the viewer's, or a live access grant
//               (app/(app)/scp/page.tsx)
//   Incidents   clearance at or below the viewer's (incidents/page.tsx)
//   Broadcasts  aimed at or below the viewer's clearance AND live right now.
//               Stricter than broadcasts/page.tsx, which also shows an author
//               their own scheduled and lapsed directives; those are not news.
//   Forums      topic floor at or below the viewer's AUTHORING clearance, the
//               same test as canAccessForum (lib/forums.ts)
//
// Titles are rendered through the redaction layer for this viewer, exactly as
// the section pages render them. If a section's rule changes, change it here.

type Viewer = {
  id: string;
  clearance: number;
  realClearance: number;
  isOwner: boolean;
  isCoOwner: boolean;
  isAdmin: boolean;
  isStaff: boolean;
};

export type FeedItem = {
  key: string;
  /** Short station tag: FILE, INCIDENT, BROADCAST, FORUM. */
  kind: string;
  href: string;
  at: Date;
  title: ReactNode;
  detail?: ReactNode;
};

const PER_SOURCE = 6;

export async function getActivityFeed(
  viewer: Viewer,
  limit = 10
): Promise<FeedItem[]> {
  const now = new Date();
  const bypass = canBypassRedaction(viewer);
  const redact = (text: string) => renderRedacted(text, viewer.clearance, bypass);

  const [files, incidents, broadcasts, posts] = await Promise.all([
    db.scpFile.findMany({
      where: {
        OR: [
          { clearanceRequired: { lte: viewer.clearance } },
          {
            accessGrants: {
              some: { userId: viewer.id, revokedAt: null, expiresAt: { gt: now } },
            },
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE,
      select: { id: true, title: true, classification: true, createdAt: true },
    }),
    db.incidentReport.findMany({
      where: { clearanceRequired: { lte: viewer.clearance } },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE,
      select: { id: true, title: true, severity: true, createdAt: true },
    }),
    db.broadcast.findMany({
      where: {
        AND: [
          { clearanceRequired: { lte: viewer.clearance } },
          liveBroadcastWhere(now),
        ],
      },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE,
      select: { id: true, title: true, createdAt: true, publishAt: true },
    }),
    // The newest post in each of the most recently active topics.
    db.forumPost.findMany({
      where: { forum: { minClearance: { lte: authoringClearance(viewer) } } },
      orderBy: { createdAt: "desc" },
      distinct: ["forumId"],
      take: PER_SOURCE,
      select: {
        id: true,
        createdAt: true,
        authorName: true,
        author: { select: { displayName: true } },
        forum: { select: { id: true, title: true } },
      },
    }),
  ]);

  const items: FeedItem[] = [
    ...files.map((f) => ({
      key: `scp-${f.id}`,
      kind: "FILE",
      href: `/scp/${f.id}`,
      at: f.createdAt,
      // Archive titles are shown as written on the archive page too.
      title: f.title,
      detail: f.classification.toUpperCase(),
    })),
    ...incidents.map((r) => ({
      key: `inc-${r.id}`,
      kind: "INCIDENT",
      href: `/incidents/${r.id}`,
      at: r.createdAt,
      title: redact(r.title),
      detail: r.severity.toUpperCase(),
    })),
    ...broadcasts.map((b) => ({
      key: `bc-${b.id}`,
      kind: "BROADCAST",
      href: "/broadcasts",
      // A scheduled directive became news when it went live, not when drafted.
      at: b.publishAt && b.publishAt > b.createdAt ? b.publishAt : b.createdAt,
      title: redact(b.title),
    })),
    ...posts.map((p) => ({
      key: `forum-${p.id}`,
      kind: "FORUM",
      href: `/forums/${p.forum.id}`,
      at: p.createdAt,
      title: redact(p.forum.title),
      detail: (
        <>
          REPLY BY {renderRedactedName(p.author?.displayName ?? p.authorName, viewer)}
        </>
      ),
    })),
  ];

  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

// "3 MIN AGO", "5 H AGO", "2 D AGO", then a plain date. Coarse on purpose.
export function agoLabel(at: Date, now = new Date()): string {
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60000);
  if (minutes < 1) return "JUST NOW";
  if (minutes < 60) return `${minutes} MIN AGO`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} H AGO`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days} D AGO`;
  return at.toISOString().slice(0, 10);
}
