// The member operations the admin panel can apply to a multi-selection.
//
// Lives outside the action module because a "use server" file may only export
// async functions — a const array exported from one is a build error — and the
// admin UI needs the list to render its operation picker.
//
// Every entry is the multi-target form of an existing single-member action;
// nothing here can do something the one-at-a-time panel cannot.
export const BULK_OPS = [
  "clearance",
  "department",
  "grantScpPost",
  "revokeScpPost",
  "grantIncidentFile",
  "revokeIncidentFile",
  "grantTestLog",
  "revokeTestLog",
  "grantHelper",
  "revokeHelper",
  "grantStaff",
  "revokeStaff",
  "suspend",
  "reinstate",
  "delete",
] as const;

export type BulkOp = (typeof BULK_OPS)[number];

export function isBulkOp(value: string): value is BulkOp {
  return (BULK_OPS as readonly string[]).includes(value);
}

export const BULK_OP_LABELS: Record<BulkOp, string> = {
  clearance: "SET CLEARANCE",
  department: "SET DEPARTMENT",
  grantScpPost: "GRANT SCP-POST",
  revokeScpPost: "REVOKE SCP-POST",
  grantIncidentFile: "GRANT INCIDENT-FILE",
  revokeIncidentFile: "REVOKE INCIDENT-FILE",
  grantTestLog: "GRANT TEST-LOG",
  revokeTestLog: "REVOKE TEST-LOG",
  grantHelper: "GRANT HELPER",
  revokeHelper: "REVOKE HELPER",
  grantStaff: "GRANT STAFF",
  revokeStaff: "REVOKE STAFF",
  suspend: "SUSPEND",
  reinstate: "REINSTATE",
  delete: "DELETE ACCOUNTS",
};

// Operations reserved for Admin and above, mirroring the single-member
// actions' own `requireAdminPowers` gate. The server re-checks these; the UI
// consults the same list only so it doesn't offer a button that will bounce.
export const ADMIN_ONLY_BULK_OPS: readonly BulkOp[] = [
  "grantHelper",
  "revokeHelper",
  "grantStaff",
  "revokeStaff",
  "delete",
];

// Operations that destroy data or cut off access, and so get a confirmation
// prompt in the UI.
export const DESTRUCTIVE_BULK_OPS: readonly BulkOp[] = ["delete", "suspend"];
