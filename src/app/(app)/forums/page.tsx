import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { canCreateForum, authoringClearance, clearanceLabel } from "@/lib/clearance";
import { canAccessForum } from "@/lib/forums";
import { StationHead, HudPanel, Readout, EmptyState } from "@/components/hud";

export default async function ForumsPage() {
  const user = await requireUser();

  const forums = await db.forum.findMany({
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
        VISIBLE TO ALL PERSONNEL · L-5+ MAY OPEN A NEW TOPIC · EACH TOPIC SETS
        ITS OWN CLEARANCE FLOOR TO CHAT
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
                  L-5+ PERSONNEL HAVE NOT YET OPENED A TOPIC.
                </p>
              )}
            </EmptyState>
          )}
          {forums.map((f) => {
            const locked = !canAccessForum(user, f);
            return (
              <Link
                key={f.id}
                href={`/forums/${f.id}`}
                className="term-row space-y-1 block"
                style={{
                  borderLeft: "2px solid color-mix(in srgb, var(--term-amber) 50%, transparent)",
                  paddingLeft: "0.75rem",
                  opacity: locked ? 0.6 : 1,
                }}
              >
                <p className="text-xs flex flex-wrap items-center gap-2">
                  <span className="clearance-chip text-[10px]">
                    {clearanceLabel(f.minClearance)}+
                  </span>
                  <span className="text-[var(--term-amber)]">{f.title}</span>
                  {locked && (
                    <span className="text-[10px] text-[var(--term-red)]">
                      ⊘ INSUFFICIENT CLEARANCE
                    </span>
                  )}
                </p>
                {f.description && (
                  <p className="text-sm text-[var(--term-fg-dim)]">
                    {f.description}
                  </p>
                )}
                <p className="hud-recid">
                  OPENED BY {f.creator.displayName} ·{" "}
                  {f._count.posts} {f._count.posts === 1 ? "POST" : "POSTS"}
                </p>
              </Link>
            );
          })}
        </div>
      </HudPanel>
    </>
  );
}
