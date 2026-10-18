// Chaos Insurgency accounts, as seen by the rest of the site. Client-safe.
//
// A CI account is a User row with isInsurgent set. It holds no permissions and
// must never surface anywhere a member could find or act on it: not in the
// roster, not in a recipient picker, not in @mentions, not as a target for a
// role change. NOT_INSURGENT is spread into every such query.

export const CI_EMAIL_DOMAIN = "insurgency.ci";

// Prisma where-fragment for "real members only".
export const NOT_INSURGENT = { isInsurgent: false } as const;

export const INSURGENT_TARGET_ERROR =
  "THAT ACCOUNT IS NOT A FOUNDATION MEMBER. ONLY SUSPENSION OR DELETION APPLY.";

// Refusal for anything that would edit a CI account as if it were a member —
// clearance, roles, department, permissions. Suspension and deletion stay
// allowed and must not call this.
export function insurgentTargetError(
  target: { isInsurgent?: boolean | null } | null | undefined
): string | null {
  return target?.isInsurgent ? INSURGENT_TARGET_ERROR : null;
}
