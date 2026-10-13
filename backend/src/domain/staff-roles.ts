

export const STAFF_ROLE_NAMES = [
  "SUPER_ADMIN",
  "HR_ADMIN",
  "CAMPUS_COORDINATOR",
  "INTERVIEWER",

"HOD",
  "STAFF",
] as const;

export function isStaffRole(name: string): boolean {
  return (STAFF_ROLE_NAMES as readonly string[]).includes(name);
}

export function nonAssignableRoles<T extends { name: string }>(
  roles: readonly T[],
): T[] {
  return roles.filter((role) => !isStaffRole(role.name));
}
