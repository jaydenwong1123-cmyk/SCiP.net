import { authoringClearance } from "@/lib/clearance";
import { hasAdminPowers, hasStaffPowers } from "@/lib/session";

// A forum is listed to every member — the section itself carries no gate —
// but reading its thread and posting in it both require meeting the topic's
// own minClearance. Kept as a single predicate for both, unlike Secure
// Channel's real-clearance-may-read / authoring-clearance-may-write split:
// a forum has no lower "read only" tier, so there is nothing to widen for
// reads.
export function canAccessForum(
  user: { clearance: number; realClearance: number },
  forum: { minClearance: number }
): boolean {
  return authoringClearance(user) >= forum.minClearance;
}

type Actor = {
  id: string;
  isOwner: boolean;
  isCoOwner: boolean;
  isAdmin: boolean;
  isStaff: boolean;
};

// The topic's own creator may retire it; staff may retire any.
export function canDeleteForum(
  actor: Actor,
  forum: { creatorId: string }
): boolean {
  return forum.creatorId === actor.id || hasStaffPowers(actor);
}

// Any post's author may retract their own line; staff may remove any.
export function canDeleteForumPost(
  actor: Actor,
  post: { authorId: string | null }
): boolean {
  return (post.authorId !== null && post.authorId === actor.id) || hasAdminPowers(actor);
}

// Any post's author may amend their own line. Nobody else may, staff
// included: removing a post is moderation, rewriting one is putting words in a
// member's mouth.
export function canEditForumPost(
  actor: { id: string },
  post: { authorId: string | null }
): boolean {
  return post.authorId !== null && post.authorId === actor.id;
}

// The reactions a member may leave on a post. Keyed by the value stored in
// ForumReaction.kind; labels are plain ASCII to match the rest of the console.
export const FORUM_REACTIONS = [
  { kind: "ack", label: "ACK", title: "Acknowledged" },
  { kind: "agree", label: "+1", title: "Agree" },
  { kind: "noted", label: "NOTED", title: "Noted for the record" },
  { kind: "query", label: "?", title: "Needs clarification" },
] as const;

export type ForumReactionKind = (typeof FORUM_REACTIONS)[number]["kind"];

export function isForumReactionKind(value: string): value is ForumReactionKind {
  return FORUM_REACTIONS.some((r) => r.kind === value);
}

// Posts per page of a thread.
export const FORUM_PAGE_SIZE = 50;

export function forumPageCount(postCount: number): number {
  return Math.max(1, Math.ceil(postCount / FORUM_PAGE_SIZE));
}

// Which page to show. A missing or malformed value means the LAST page, since
// a member opening a thread wants the newest replies and the reply box.
export function pickForumPage(raw: string | undefined, postCount: number): number {
  const pages = forumPageCount(postCount);
  const n = raw && /^\d+$/.test(raw) ? parseInt(raw, 10) : pages;
  return Math.min(Math.max(n, 1), pages);
}
