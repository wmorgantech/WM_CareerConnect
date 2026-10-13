

export const GLOBAL_RESULT_ROLES = ["SUPER_ADMIN", "HR_ADMIN"] as const;
export const COLLEGE_SCOPED_ROLES = ["HOD", "STAFF"] as const;

export type ResultScope =
  | { kind: "ALL" }
  | { kind: "COLLEGES"; collegeIds: string[] }
  | { kind: "NONE" };

export function resolveResultScope(
  roles: readonly string[],
  assignedCollegeIds: readonly string[],
): ResultScope {
  if (roles.some((r) => (GLOBAL_RESULT_ROLES as readonly string[]).includes(r))) {
    return { kind: "ALL" };
  }

  if (roles.some((r) => (COLLEGE_SCOPED_ROLES as readonly string[]).includes(r))) {
    const ids = [...new Set(assignedCollegeIds)];

    return ids.length > 0 ? { kind: "COLLEGES", collegeIds: ids } : { kind: "NONE" };
  }

  return { kind: "NONE" };
}

export function canSeeCollege(scope: ResultScope, collegeId: string | null): boolean {
  if (scope.kind === "ALL") return true;
  if (scope.kind === "NONE" || collegeId === null) return false;

  return scope.collegeIds.includes(collegeId);
}
