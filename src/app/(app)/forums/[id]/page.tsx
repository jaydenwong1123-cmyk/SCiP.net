import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { clearanceDisplay, clearanceLabel, clearanceChipStyle } from "@/lib/clearance";
import { canAccessForum, canDeleteForum, canDeleteForumPost } from "@/lib/forums";
import {
  renderRedacted,
  renderRedactedName,
  canBypassRedaction,
} from "@/lib/redact";
import { ForumPostForm } from "./forum-post-form";
import { deleteForumAction } from "../actions";
import { deleteForumPostAction } from "./actions";
import {
  StationHead,
  HudPanel,
  HudBanner,
  Readout,
  EmptyState,
} from "@/components/hud";

export default async function ForumPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  // No `creator` join, for the same reason as the topic index: the opener's
  // account may be gone.
  const forum = await db.forum.findUnique({
    where: { id },
    include: { _count: { select: { posts: true } } },
  });
  // A topic below the viewer's clearance is treated as if it doesn't exist —
  // same 404 as a bad id, so its title, description and post count never
  // reach a client who guesses or bookmarks the URL.
  if (!forum || !canAccessForum(user, forum)) notFound();

  // The NEWEST 500, shown oldest-first. Taking the first 500 in ascending
  // order would freeze a long thread: every post after the 500th, including
  // the one the member just wrote, would never load.
  const [newest, creator] = await Promise.all([
    db.forumPost.findMany({
      where: { forumId: id },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        author: { select: { displayName: true, clearance: true, designation: true } },
      },
    }),
    db.user.findUnique({
      where: { id: forum.creatorId },
      select: { displayName: true },
    }),
  ]);
  const posts = newest.reverse();

  return (
    <>
      <HudBanner level="internal">
        FORUM · {clearanceLabel(forum.minClearance)}+ TO READ AND POST
      </HudBanner>

      <StationHead
        code="SEC-08 // FORUM"
        title={renderRedacted(forum.title, user.clearance, canBypassRedaction(user))}
      >
        <Readout label="Posts" value={forum._count.posts} small />
        <Readout
          label="Opened By"
          value={
            creator ? renderRedactedName(creator.displayName ?? "", user) : "[DELETED ACCOUNT]"
          }
          small
        />
        <Link href="/forums" className="term-link text-sm">
          [BACK TO FORUMS]
        </Link>
        {canDeleteForum(user, forum) && (
          <form action={deleteForumAction}>
            <input type="hidden" name="id" value={forum.id} />
            <button className="term-button term-button--danger term-button--sm">
              DELETE FORUM
            </button>
          </form>
        )}
      </StationHead>

      {forum.description && (
        <p className="text-sm text-[var(--term-fg-dim)]">
          {renderRedacted(forum.description, user.clearance, canBypassRedaction(user))}
        </p>
      )}

      <HudPanel code="01" title="POST" status={`REQUIRES ${clearanceLabel(forum.minClearance)}+`}>
        <ForumPostForm forumId={forum.id} />
      </HudPanel>

      <HudPanel code="02" title="THREAD" status={`${forum._count.posts} POSTS`}>
        <div className="hud-list">
          {posts.length === 0 && (
            <EmptyState glyph="◈" title="No posts yet">
              <p className="text-xs">BE THE FIRST TO POST IN THIS TOPIC.</p>
            </EmptyState>
          )}
          {posts.map((p) => (
            <div
              key={p.id}
              className="term-row space-y-1"
              style={{
                borderLeft: "2px solid color-mix(in srgb, var(--term-amber) 50%, transparent)",
                paddingLeft: "0.75rem",
              }}
            >
              <p className="text-xs flex flex-wrap items-center gap-2">
                {p.author && (
                  <span className="clearance-chip text-[10px]" style={clearanceChipStyle(p.author.clearance)}>
                    {clearanceDisplay(p.author.clearance, p.author.designation)}
                  </span>
                )}
                <span className="text-[var(--term-amber)]">
                  {renderRedactedName(p.author?.displayName ?? p.authorName, user)}
                </span>
                <span className="hud-recid">
                  {p.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                </span>
              </p>
              <pre className="whitespace-pre-wrap break-words font-mono text-sm">
                {renderRedacted(p.body, user.clearance, canBypassRedaction(user))}
              </pre>
              {canDeleteForumPost(user, p) && (
                <form action={deleteForumPostAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="forumId" value={forum.id} />
                  <button className="term-button term-button--danger term-button--sm">
                    DELETE
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      </HudPanel>
    </>
  );
}
