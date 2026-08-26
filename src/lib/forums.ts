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
