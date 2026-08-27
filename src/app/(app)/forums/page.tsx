import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { canCreateForum, authoringClearance, clearanceLabel } from "@/lib/clearance";
import {
  renderRedacted,
  renderRedactedName,
  canBypassRedaction,
} from "@/lib/redact";
import { StationHead, HudPanel, Readout, EmptyState } from "@/components/hud";

export default async function ForumsPage() {
  const user = await requireUser();

  // A topic below the viewer's clearance doesn't exist as far as they're
  // concerned — filtered out of the query itself rather than hidden in the
  // UI, so its title, description and existence never reach the client.
  const forums = await db.forum.findMany({
    where: { minClearance: { lte: authoringClearance(user) } },
    orderBy: { createdAt: "desc" },
    include: {
      creator: { select: { displayName: true } },
      _count: { select: { posts: true } },
    },
  });

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
        L-5+ MAY OPEN A NEW TOPIC · EACH TOPIC SETS ITS OWN CLEARANCE FLOOR ·
        A TOPIC ABOVE YOUR CLEARANCE DOES NOT APPEAR HERE
      </p>

      <HudPanel code="01" title="TOPIC INDEX" status={`${forums.length} ON RECORD`}>
        <div className="hud-list">
          {forums.length === 0 && (
            <EmptyState glyph="◈" title="No forums open yet">
              {canCreateForum(authoringClearance(user)) ? (
                <p className="text-xs">
                  L-5+ PERSONNEL MAY OPEN THE FIRST ONE.
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
                <span className="clearance-chip text-[10px]">
                  {clearanceLabel(f.minClearance)}+
                </span>
                <span className="text-[var(--term-amber)]">
                  {renderRedacted(f.title, user.clearance, canBypassRedaction(user))}
                </span>
              </p>
              {f.description && (
                <p className="text-sm text-[var(--term-fg-dim)]">
                  {renderRedacted(f.description, user.clearance, canBypassRedaction(user))}
                </p>
              )}
              <p className="hud-recid">
                OPENED BY {renderRedactedName(f.creator.displayName ?? "", user)} ·{" "}
                {f._count.posts} {f._count.posts === 1 ? "POST" : "POSTS"}
              </p>
            </Link>
          ))}
        </div>
      </HudPanel>
    </>
  );
}
