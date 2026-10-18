import { cache } from "react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import {
  MEMBER_NOTE_CLEARANCE,
  R5_DESIGNATION,
  HACK_MAX_TIER,
  authoringClearance,
} from "@/lib/clearance";
import { getViewAsClearance } from "@/lib/view-as";
import { getActiveHackGrant } from "@/lib/hack/grant";
import { needsSentinel } from "@/lib/sentinel";
// One-way edge: site-config reaches back into this module with a lazy import
// inside enforceShutdown, precisely so this one can stay static.
import { enforceShutdown } from "@/lib/site-config";
import { enforceSystemOnline } from "@/lib/ci/lockdown";

// Personnel who may flag/annotate members: L-6 and above, plus staff/admin/owner.
//
// Annotating another member's record is authorship, so the rank check resolves
// against `authoringClearance` — a terminal intrusion that reaches L-6 buys
// read access and nothing else, and must not be able to write into anyone's
// personnel file.
export function canAnnotateMembers(user: {
  clearance: number;
  realClearance: number;
  isOwner: boolean;
  isCoOwner: boolean;
  isAdmin: boolean;
  isStaff: boolean;
}): boolean {
  return (
    authoringClearance(user) >= MEMBER_NOTE_CLEARANCE ||
    hasStaffPowers(user)
  );
}

// Holders of the per-member personnel-file grant, RAISA administrators (the
// R5 designation), and staff/admin/owner. RAISA are the custodians of
// personnel records, so they may rewrite any member's personal file, not only
// their own; the explicit grant lets the same duty be handed to anyone else.
// Mirrors the RAISA definition used for the message logs — clearance rank alone
// never confers this.
export function canEditAnyPersonalFile(user: {
  designation?: string | null;
  canEditPersonnel?: boolean;
  isOwner: boolean;
  isCoOwner: boolean;
  isAdmin: boolean;
  isStaff: boolean;
}): boolean {
  return (
    user.canEditPersonnel === true ||
    user.designation === R5_DESIGNATION ||
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
  if (viewAs !== null) {
    return {
      ...user,
      clearance: viewAs,
      // The RAISA administrator designation (R5) is an identity at rank 6; carrying
      // it into a rank-2 persona would be nonsense.
      designation: null,
      isOwner: false,
      isCoOwner: false,
      isAdmin: false,
      isStaff: false,
      isHelper: false,
      realClearance: user.clearance,
      viewAsClearance: viewAs,
      // A simulation suppresses an intrusion grant outright. "View as" exists
      // to see LESS, so a banner reading "SIMULATING L-1 (ACTUAL L-1, ILLICIT
      // L-6)" would be incoherent — and canViewAs already requires a real
      // rank of 5, which no grant-boosted member has.
      hackClearance: null,
      hackGrantExpiresAt: null,
    };
  }

  // A live terminal intrusion raises READ access, and only upward.
  //
  // Nothing here touches `designation` or any role flag: the grant confers no
  // authority, only reach. `realClearance` stays the stored rank so
  // authoringClearance() can strip the elevation back off at every write — see
  // the note on lib/clearance.ts, and R1 in the feature plan.
  //
  // Short-circuited at HACK_MAX_TIER: there is nothing a grant could raise for
  // someone already at rank 6+, and that covers every staff member without
  // spending a query on them.
  const grant =
    user.clearance >= HACK_MAX_TIER ? null : await getActiveHackGrant(user.id);

  if (!grant || grant.tier <= user.clearance) {
    return {
      ...user,
      realClearance: user.clearance,
      viewAsClearance: null,
      hackClearance: null,
      hackGrantExpiresAt: null,
    };
  }

  return {
    ...user,
    clearance: grant.tier,
    realClearance: user.clearance,
    viewAsClearance: null,
    hackClearance: grant.tier,
    hackGrantExpiresAt: grant.expiresAt,
  };
});

// Gate for the authenticated layout: the root owner answers the SENTINEL
// challenge before any page renders.
//
// Resolved against the *real* row, not the possibly-downgraded persona from
// getCurrentUser. A "view as" simulation strips isOwner, so checking the
// persona would let anyone holding the owner's session set the view-as cookie
// and browse straight past the challenge.
export async function enforceSentinel(): Promise<void> {
  const user = await getRealUser();
  if (!user) return;
  if (await needsSentinel(user)) redirect("/sentinel");
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // The owner's challenge comes before anything else this function would
  // otherwise let through.
  //
  // It has to live here and not only in the layout: a layout that redirects
  // does not stop its sibling page from rendering in the same pass, so the
  // page's content is still serialized into the response the browser is about
  // to navigate away from. Gating at the page's own entry point is what keeps
  // that data from being produced at all.
  await enforceSentinel();
  // Likewise for a terminated network, and for the same reason: the layout
  // gate alone would still let each page build and serialize its content.
  await enforceShutdown();
  // A member suspended mid-session loses access immediately.
  if (user.suspended) redirect("/suspended");
  // A Chaos Insurgency account holds no permissions on the member network and
  // never reaches any page behind this function. Checked before set-name
  // because CI accounts are named at enlistment and must not be offered the
  // member naming screen.
  //
  // Every requireStaff/requireOwner/requireAdminPowers/requireRootOwner wraps
  // this function, so they inherit the block. Known entry points that do NOT
  // come through here, and so carry their own isInsurgent check:
  //   app/page.tsx, app/suspended/page.tsx, app/(auth)/set-name (page and
  //   setNameAction), app/attachments/[id]/route.ts, app/api/memetic/route.ts,
  //   app/api/siege/route.ts, app/(app)/settings/view-as-actions.ts.
  // Anything new that reads the session without requireUser() must add one.
  if (user.isInsurgent) redirect("/insurgency");
  if (!user.displayName) redirect("/set-name");
  // A section taken down by a Chaos Insurgency siege. Gated here rather than in
  // the layout for the same reason as the sentinel above: the page must not
  // build its content at all.
  await enforceSystemOnline(user);
  return user;
}

// Gate for the Chaos Insurgency portal: the inverse of requireUser. Resolved
// against the stored row, so neither "view as" nor an intrusion grant plays
// any part — a CI account is a CI account.
export async function requireInsurgent() {
  const user = await getRealUser();
  if (!user) redirect("/login");
  await enforceShutdown();
  if (user.suspended) redirect("/suspended");
  if (!user.isInsurgent) redirect("/");
  return user;
}

// Role hierarchy:
//   Owner    (isOwner)   — seeded, supreme. Only the owner can grant/revoke
//                          Admin, and only the owner can appoint a Co-Owner.
//   Co-Owner (isCoOwner) — everything the owner can do, held by at most
//                          MAX_CO_OWNERS members at a time (see roles.ts).
//                          Cannot be demoted/suspended/deleted by anyone but
//                          the owner, and cannot appoint a fellow Co-Owner.
//   Admin    (isAdmin)   — owner-level powers: delete accounts, grant L-7 (NULL),
//                          grant/revoke Staff, plus everything Staff can do.
//   Staff    (isStaff)   — elevated panel access: rename, set clearance (below
//                          L-7), toggle SCP-post, delete SCP files, invite
//                          codes, review clearance requests.
//   Helper   (isHelper)  — sits directly below Staff and carries no power over
//                          another member. It works the General Assistance
//                          ticket queue, and reaches /training, which grades
//                          practice puzzles and touches nothing else. Granted
//                          only by an Admin or above.

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

// Strictly the seeded owner — co-owner appointment, and the OMEGA AUTHORITY
// controls.
//
// Also the enforcement point for the SENTINEL challenge. Layouts alone are not
// enough: a server action runs its own request and never renders the layout, so
// without the check here a session sitting on the challenge screen could still
// POST straight into an owner-only action. Everything that trusts "this is the
// root owner" comes through this function, so the gate belongs here.
export async function requireRootOwner() {
  const user = await requireUser();
  if (!user.isOwner) redirect("/");
  if (await needsSentinel(user)) redirect("/sentinel");
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
