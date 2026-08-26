import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { clearanceDisplay, clearanceLabel } from "@/lib/clearance";
import { canAccessForum, canDeleteForum, canDeleteForumPost } from "@/lib/forums";
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

  const forum = await db.forum.findUnique({
    where: { id },
    include: { creator: { select: { displayName: true } } },
  });
  // A topic below the viewer's clearance is treated as if it doesn't exist —
  // same 404 as a bad id, so its title, description and post count never
  // reach a client who guesses or bookmarks the URL.
  if (!forum || !canAccessForum(user, forum)) notFound();

  const posts = await db.forumPost.findMany({
    where: { forumId: id },
    orderBy: { createdAt: "asc" },
    take: 500,
    include: {
      author: { select: { displayName: true, clearance: true, designation: true } },
    },
  });

  return (
    <>
      <HudBanner level="internal">
        FORUM · {clearanceLabel(forum.minClearance)}+ TO READ AND POST
      </HudBanner>

      <StationHead code="SEC-08 // FORUM" title={forum.title.toUpperCase()}>
        <Readout label="Posts" value={posts.length} small />
        <Readout label="Opened By" value={forum.creator.displayName} small />
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
        <p className="text-sm text-[var(--term-fg-dim)]">{forum.description}</p>
      )}

      <HudPanel code="01" title="POST" status={`REQUIRES ${clearanceLabel(forum.minClearance)}+`}>
        <ForumPostForm forumId={forum.id} />
      </HudPanel>

      <HudPanel code="02" title="THREAD" status={`${posts.length} POSTS`}>
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
                  <span className="clearance-chip text-[10px]">
                    {clearanceDisplay(p.author.clearance, p.author.designation)}
                  </span>
                )}
                <span className="text-[var(--term-amber)]">
                  {p.author?.displayName ?? p.authorName}
                </span>
                <span className="hud-recid">
                  {p.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                </span>
              </p>
              <pre className="whitespace-pre-wrap break-words font-mono text-sm">
                {p.body}
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
