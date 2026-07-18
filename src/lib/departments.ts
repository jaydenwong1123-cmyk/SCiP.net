// Departments members may assign to themselves from the profile page.
export const OPEN_DEPARTMENTS = [
  "Facility Enforcement",
  "Medical Department",
  "Scientific Department",
  "Site Administration",
] as const;

// Restricted departments only staff (owner/admin/staff) may assign to a member.
export const RESTRICTED_DEPARTMENTS = [
  "Ethics Committee",
  "O5 Command",
  "The Administrator",
  "Mobile Task Force",
  "Alpha-1",
  "Omega-1",
  "Resh-1",
] as const;

export const ALL_DEPARTMENTS = [
  ...OPEN_DEPARTMENTS,
  ...RESTRICTED_DEPARTMENTS,
] as const;

export function isOpenDepartment(value: string): boolean {
  return (OPEN_DEPARTMENTS as readonly string[]).includes(value);
}

export function isRestrictedDepartment(value: string): boolean {
  return (RESTRICTED_DEPARTMENTS as readonly string[]).includes(value);
}

export function isValidDepartment(value: string): boolean {
  return (ALL_DEPARTMENTS as readonly string[]).includes(value);
}
