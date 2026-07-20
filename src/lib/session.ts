import { cache } from "react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { MEMBER_NOTE_CLEARANCE } from "@/lib/clearance";
import { getViewAsClearance } from "@/lib/view-as";

// Personnel who may flag/annotate members: L-5 and above, plus staff/admin/owner.
export function canAnnotateMembers(user: {
  clearance: number;
  isOwner: boolean;
  isCoOwner: boolean;
  isAdmin: boolean;
  isStaff: boolean;
}): boolean {
  return (
    user.clearance >= MEMBER_NOTE_CLEARANCE ||
    hasStaffPowers(user)
  );
}

// The member as stored — never downgraded by "view as". Used by the Settings
// page and the revert action, which must keep working while a simulation is
// active.
export const getRealUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return null;
  return db.user.findUnique({ where: { id: session.user.id } });
});

// Memoized per request: the layout and the page both resolve the current user,
// so without this cache each navigation issues the same DB lookup twice.
//
// If the member is running a "view as" simulation, what comes back here is the
// downgraded persona — lower clearance, no elevated roles — so every page,
// nav gate and redaction check in the app sees the simulated viewer without
// having to know the feature exists. `realClearance` carries the true rank for
// the few places that need to show it (the banner, Settings).
export const getCurrentUser = cache(async () => {
  const user = await getRealUser();
  if (!user) return null;

  const viewAs = await getViewAsClearance(user);
  if (viewAs === null) {
    return { ...user, realClearance: user.clearance, viewAsClearance: null };
  }

  return {
    ...user,
    clearance: viewAs,
    // An alternate designation (E5 / R5) is an identity at rank 6; carrying it
    // into a rank-2 persona would be nonsense.
    designation: null,
    isOwner: false,
    isCoOwner: false,
    isAdmin: false,
    isStaff: false,
    isHelper: false,
    realClearance: user.clearance,
    viewAsClearance: viewAs,
  };
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // A member suspended mid-session loses access immediately.
  if (user.suspended) redirect("/suspended");
  if (!user.displayName) redirect("/set-name");
  return user;
}

// Role hierarchy:
//   Owner    (isOwner)   — seeded, supreme. Only the owner can grant/revoke
//                          Admin, and only the owner can appoint the Co-Owner.
//   Co-Owner (isCoOwner) — everything the owner can do, held by at most one
//                          member. Cannot be demoted/suspended/deleted by
//                          anyone but the owner, and cannot appoint itself a
//                          replacement.
//   Admin    (isAdmin)   — owner-level powers: delete accounts, grant L-OMNI,
//                          grant/revoke Staff, plus everything Staff can do.
//   Staff    (isStaff)   — elevated panel access: rename, set clearance (below
//                          L-OMNI), toggle SCP-post, delete SCP files, invite
//                          codes, review clearance requests.
//   Helper   (isHelper)  — sits directly below Staff and carries no panel
//                          access at all. Its single power is working the
//                          General Assistance ticket queue. Granted only by
//                          an Admin or above.

// Owner-equivalent: the seeded owner or the appointed co-owner.
export function hasOwnerPowers(user: { isOwner: boolean; isCoOwner: boolean }) {
  return user.isOwner || user.isCoOwner;
}

export function hasAdminPowers(user: {
  isOwner: boolean;
  isCoOwner: boolean;
  isAdmin: boolean;
}) {
  return hasOwnerPowers(user) || user.isAdmin;
}

export function hasStaffPowers(user: {
  isOwner: boolean;
  isCoOwner: boolean;
  isAdmin: boolean;
  isStaff: boolean;
}) {
  return hasAdminPowers(user) || user.isStaff;
}

// Helper or anything above it. Note this is one-directional: Helper confers
// nothing that Staff has, so no other `has*Powers` check consults isHelper.
export function hasHelperPowers(user: {
  isOwner: boolean;
  isCoOwner: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  isHelper: boolean;
}) {
  return hasStaffPowers(user) || user.isHelper;
}

// Owner or co-owner.
export async function requireOwner() {
  const user = await requireUser();
  if (!hasOwnerPowers(user)) redirect("/");
  return user;
}

// Strictly the seeded owner — appointing/removing the co-owner only.
export async function requireRootOwner() {
  const user = await requireUser();
  if (!user.isOwner) redirect("/");
  return user;
}

// Owner-level powers (owner or admin).
export async function requireAdminPowers() {
  const user = await requireUser();
  if (!hasAdminPowers(user)) redirect("/");
  return user;
}

// Any elevated role (owner, admin, or staff) — panel access + staff actions.
export async function requireStaff() {
  const user = await requireUser();
  if (!hasStaffPowers(user)) redirect("/");
  return user;
}
