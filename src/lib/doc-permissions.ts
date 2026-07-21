import { hasStaffPowers, hasAdminPowers } from "@/lib/session";

// Edit permissions for the three revisable document types.
//
// These live outside the action modules because a "use server" file may only
// export async functions — a synchronous predicate exported from one is a
// build error. Pages need these too, to decide whether to render an EDIT link.

type Actor = {
  id: string;
  isOwner: boolean;
  isCoOwner: boolean;
  isAdmin: boolean;
  isStaff: boolean;
};

// Creation rights. The per-member grant is the normal route, but admin-level
// roles carry it implicitly — an admin never needs to grant it to themselves.
export function canCreateScpFile(
  actor: Actor & { canPostScp: boolean }
): boolean {
  return actor.canPostScp || hasAdminPowers(actor);
}

export function canCreateIncident(
  actor: Actor & { canFileIncident: boolean }
): boolean {
  return actor.canFileIncident || hasAdminPowers(actor);
}

// Authors may revise their own documents; staff may revise any.
export function canEditScpFile(actor: Actor, file: { authorId: string }): boolean {
  return file.authorId === actor.id || hasStaffPowers(actor);
}

export function canEditIncident(
  actor: Actor,
  report: { authorId: string }
): boolean {
  return report.authorId === actor.id || hasStaffPowers(actor);
}

// Broadcasts are site-wide directives, so editing tracks the stricter
// admin-level bar that already governs deleting them.
export function canEditBroadcast(
  actor: Actor,
  broadcast: { authorId: string }
): boolean {
  return broadcast.authorId === actor.id || hasAdminPowers(actor);
}
