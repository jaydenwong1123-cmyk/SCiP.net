import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { clearanceDisplay, clearanceLabel, clearanceChipStyle } from "@/lib/clearance";
import {
  FORUM_PAGE_SIZE,
  FORUM_REACTIONS,
  canAccessForum,
  canDeleteForum,
  canDeleteForumPost,
  canEditForumPost,
  forumPageCount,
  pickForumPage,
} from "@/lib/forums";
import {
  renderRedacted,
  renderRedactedName,
  canBypassRedaction,
} from "@/lib/redact";
import { renderBody } from "@/lib/render-body";
import { getMentionCandidates, linkifyMentionsInBody } from "@/lib/mentions";
import { isNewSince, visitMarker } from "@/lib/activity";
import { ForumPostForm } from "./forum-post-form";
import { EditPostForm, ReplyButton } from "./forum-post-tools";
import { deleteForumAction } from "../actions";
import { deleteForumPostAction, toggleForumReactionAction } from "./actions";
import {
  StationHead,
  HudPanel,
  HudBanner,
  Readout,
  EmptyState,
} from "@/components/hud";

export const metadata: Metadata = { title: "Forum" };

export default async function ForumPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireUser();
  const [{ id }, { page: pageParam }] = await Promise.all([params, searchParams]);

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

  // Paged, oldest first. With no ?page the LAST page is shown, so a member
  // opening a thread lands on the newest replies, next to the reply box.
  const pages = forumPageCount(forum._count.posts);
  const page = pickForumPage(pageParam, forum._count.posts);

  const [posts, creator, mentionCandidates] = await Promise.all([
    db.forumPost.findMany({
      where: { forumId: id },
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * FORUM_PAGE_SIZE,
      take: FORUM_PAGE_SIZE,
      include: {
        author: { select: { displayName: true, clearance: true, designation: true } },
      },
    }),
    db.user.findUnique({
      where: { id: forum.creatorId },
      select: { displayName: true },
    }),
    getMentionCandidates(),
  ]);

  const [reactions, bodies] = await Promise.all([
    posts.length > 0
      ? db.forumReaction.findMany({
          where: { postId: { in: posts.map((p) => p.id) } },
          select: { postId: true, kind: true, userId: true },
        })
      : Promise.resolve([]),
    // Rendered up front: cross-link resolution is async and the list below is
    // built with a synchronous .map(). Redaction runs first inside renderBody,
    // so the mention pass only ever sees text this viewer may read.
    Promise.all(
      posts.map(
        async (p) =>
          [
            p.id,
            linkifyMentionsInBody(await renderBody(p.body, user), mentionCandidates),
          ] as const
      )
    ),
  ]);
  const bodyById = new Map(bodies);

  // postId -> kind -> { count, mine }
  const tally = new Map<string, Map<string, { count: number; mine: boolean }>>();
  for (const r of reactions) {
    const byKind = tally.get(r.postId) ?? new Map();
    const entry = byKind.get(r.kind) ?? { count: 0, mine: false };
    entry.count += 1;
    if (r.userId === user.id) entry.mine = true;
    byKind.set(r.kind, entry);
    tally.set(r.postId, byKind);
  }

  const marker = visitMarker(user);
  const pageHref = (n: number) => `/forums/${forum.id}?page=${n}`;
  const pager = pages > 1 && (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      {page > 1 ? (
        <Link href={pageHref(page - 1)} className="term-link">
          [◂ OLDER]
        </Link>
      ) : (
        <span className="text-[var(--term-fg-dim)]">[◂ OLDER]</span>
      )}
      <span className="hud-recid">
        PAGE {page} OF {pages}
      </span>
      {page < pages ? (
        <Link href={pageHref(page + 1)} className="term-link">
          [NEWER ▸]
        </Link>
      ) : (
        <span className="text-[var(--term-fg-dim)]">[NEWER ▸]</span>
      )}
      {page < pages && (
        <Link href={pageHref(pages)} className="term-link">
          [LATEST]
        </Link>
      )}
    </div>
  );

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

      <HudPanel
        code="01"
        title="THREAD"
        status={`${forum._count.posts} ${forum._count.posts === 1 ? "POST" : "POSTS"}`}
      >
        {pager && <div className="mb-2">{pager}</div>}
        <div className="hud-list">
          {posts.length === 0 && (
            <EmptyState glyph="◈" title="No posts yet">
              <p className="text-xs">BE THE FIRST TO POST IN THIS TOPIC.</p>
            </EmptyState>
          )}
          {posts.map((p) => {
            const mine = p.authorId === user.id;
            const name = p.author?.displayName ?? "";
            // A name carrying redaction markup cannot be typed back as a
            // mention, so those posts get no reply shortcut.
            const canReplyTo = !mine && name !== "" && !name.includes("[*");
            const byKind = tally.get(p.id);
            return (
              <div
                key={p.id}
                id={`post-${p.id}`}
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
                    {p.editedAt && " · AMENDED"}
                  </span>
                  {!mine && isNewSince(p.createdAt, marker) && (
                    <span className="clearance-chip text-[10px]">NEW</span>
                  )}
                </p>
                <pre className="whitespace-pre-wrap break-words font-mono text-sm">
                  {bodyById.get(p.id)}
                </pre>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  {FORUM_REACTIONS.map((r) => {
                    const entry = byKind?.get(r.kind);
                    return (
                      <form key={r.kind} action={toggleForumReactionAction}>
                        <input type="hidden" name="postId" value={p.id} />
                        <input type="hidden" name="kind" value={r.kind} />
                        <button
                          className="term-button term-button--sm"
                          title={r.title}
                          aria-pressed={entry?.mine ?? false}
                          aria-label={`${r.title}${entry ? `, ${entry.count}` : ""}`}
                          style={
                            entry?.mine
                              ? { borderColor: "var(--term-fg-bright)" }
                              : entry
                                ? undefined
                                : { opacity: 0.55 }
                          }
                        >
                          {r.label}
                          {entry ? ` ${entry.count}` : ""}
                        </button>
                      </form>
                    );
                  })}
                  {canReplyTo && <ReplyButton name={name} />}
                  {canEditForumPost(user, p) && (
                    <EditPostForm id={p.id} body={p.body} />
                  )}
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
              </div>
            );
          })}
        </div>
        {pager && <div className="mt-2">{pager}</div>}
      </HudPanel>

      <HudPanel code="02" title="POST" status={`REQUIRES ${clearanceLabel(forum.minClearance)}+`}>
        <ForumPostForm forumId={forum.id} />
      </HudPanel>
    </>
  );
}
