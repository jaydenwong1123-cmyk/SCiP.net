import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { canCreateForum, authoringClearance, clearanceLabel, clearanceChipStyle } from "@/lib/clearance";
import {
  renderRedacted,
  renderRedactedName,
  canBypassRedaction,
} from "@/lib/redact";
import { StationHead, HudPanel, Readout, EmptyState } from "@/components/hud";
import { isNewSince, visitMarker } from "@/lib/activity";

export const metadata: Metadata = { title: "Forums" };

export default async function ForumsPage() {
  const user = await requireUser();

  // A topic below the viewer's clearance doesn't exist as far as they're
  // concerned — filtered out of the query itself rather than hidden in the
  // UI, so its title, description and existence never reach the client.
  const listed = await db.forum.findMany({
    where: { minClearance: { lte: authoringClearance(user) } },
    orderBy: { createdAt: "desc" },
    // No `creator` join: a topic outlives the member who opened it, and a
    // required join to a deleted account throws for the whole page.
    include: { _count: { select: { posts: true } } },
  });
  const [creatorRows, lastPosts] = await Promise.all([
    db.user.findMany({
      where: { id: { in: [...new Set(listed.map((f) => f.creatorId))] } },
      select: { id: true, displayName: true },
    }),
    // Newest post per topic, for the "last activity" stamp and the ordering.
    listed.length > 0
      ? db.forumPost.groupBy({
          by: ["forumId"],
          where: { forumId: { in: listed.map((f) => f.id) } },
          _max: { createdAt: true },
        })
      : Promise.resolve([]),
  ]);
  const creators = new Map(creatorRows.map((u) => [u.id, u.displayName ?? ""]));
  const lastPostAt = new Map(
    lastPosts.flatMap((g) =>
      g._max.createdAt ? [[g.forumId, g._max.createdAt] as const] : []
    )
  );
  // Most recently active first: a topic someone just replied to rises to the
  // top, so the index shows where the conversation is rather than which topic
  // happens to be newest.
  const activityAt = (f: { id: string; createdAt: Date }) =>
    lastPostAt.get(f.id) ?? f.createdAt;
  const forums = [...listed].sort(
    (a, b) => activityAt(b).getTime() - activityAt(a).getTime()
  );
  const marker = visitMarker(user);

  return (
    <>
      <StationHead code="SEC-08 // DISCUSSION" title="FORUMS">
        <Readout label="Open Topics" value={forums.length} />
        {canCreateForum(authoringClearance(user)) && (
          <Link href="/forums/new" className="term-button text-sm">
            + OPEN FORUM
          </Link>
        )}
      </StationHead>

      <p className="text-[10px] text-[var(--term-fg-dim)]">
        L-6+ MAY OPEN A NEW TOPIC · EACH TOPIC SETS ITS OWN CLEARANCE FLOOR ·
        A TOPIC ABOVE YOUR CLEARANCE DOES NOT APPEAR HERE · MOST RECENTLY ACTIVE
        FIRST
      </p>

      <HudPanel code="01" title="TOPIC INDEX" status={`${forums.length} ON RECORD`}>
        <div className="hud-list">
          {forums.length === 0 && (
            <EmptyState glyph="◈" title="No forums open yet">
              {canCreateForum(authoringClearance(user)) ? (
                <p className="text-xs">
                  L-6+ PERSONNEL MAY OPEN THE FIRST ONE.
                </p>
              ) : (
                <p className="text-xs">
                  NONE OPEN AT YOUR CLEARANCE YET.
                </p>
              )}
            </EmptyState>
          )}
          {forums.map((f) => (
            <Link
              key={f.id}
              href={`/forums/${f.id}`}
              className="term-row space-y-1 block"
              style={{
                borderLeft: "2px solid color-mix(in srgb, var(--term-amber) 50%, transparent)",
                paddingLeft: "0.75rem",
              }}
            >
              <p className="text-xs flex flex-wrap items-center gap-2">
                <span className="clearance-chip text-[10px]" style={clearanceChipStyle(f.minClearance)}>
                  {clearanceLabel(f.minClearance)}+
                </span>
                <span className="text-[var(--term-amber)]">
                  {renderRedacted(f.title, user.clearance, canBypassRedaction(user))}
                </span>
                {isNewSince(activityAt(f), marker) && (
                  <span className="clearance-chip text-[10px]">NEW</span>
                )}
              </p>
              {f.description && (
                <p className="text-sm text-[var(--term-fg-dim)]">
                  {renderRedacted(f.description, user.clearance, canBypassRedaction(user))}
                </p>
              )}
              <p className="hud-recid">
                OPENED BY {creators.has(f.creatorId)
                  ? renderRedactedName(creators.get(f.creatorId)!, user)
                  : "[DELETED ACCOUNT]"} ·{" "}
                {f._count.posts} {f._count.posts === 1 ? "POST" : "POSTS"}
                {lastPostAt.has(f.id) &&
                  ` · LAST POST ${lastPostAt
                    .get(f.id)!
                    .toISOString()
                    .slice(0, 16)
                    .replace("T", " ")} UTC`}
              </p>
            </Link>
          ))}
        </div>
      </HudPanel>
    </>
  );
}
