import type { Prisma } from "../../generated/prisma/client";

export const SUPER_ADMIN_ROLE = "SUPER_ADMIN";

export type UserSafetyErrorCode =
  | "CANNOT_MODIFY_OWN_ACCOUNT"
  | "LAST_SUPER_ADMIN_PROTECTED"
  | "USER_ASSIGNED_TO_INTERVIEWS"
  | "USER_IN_USE"
  | "ROLE_NOT_ASSIGNABLE"
  | "NOT_COLLEGE_SCOPED"
  | "COLLEGE_NOT_FOUND";

export class UserSafetyError extends Error {
  readonly code: UserSafetyErrorCode;
  readonly statusCode: number;

  constructor(
    code: UserSafetyErrorCode,
    message: string,
    statusCode: number,
  ) {
    super(message);
    this.name = "UserSafetyError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type AccountChange =
  | { kind: "DEACTIVATE" }
  | { kind: "DELETE" }
  | { kind: "SET_ROLES"; roleIds: string[] };

type SafetyDb = Pick<
  Prisma.TransactionClient,
  "$queryRaw"
>;

export async function assertAccountChangeAllowed(
  db: SafetyDb,
  input: {
    actorId: string | undefined;
    targetId: string;
    change: AccountChange;
  },
): Promise<void> {
  const { actorId, targetId, change } = input;

  const roles = await db.$queryRaw<
    { id: string }[]
  >`SELECT id FROM "Role" WHERE name = ${SUPER_ADMIN_ROLE} FOR NO KEY UPDATE`;

  const superAdminRoleId = roles[0]?.id;

  if (!superAdminRoleId) {
    return;
  }

  if (
    change.kind === "SET_ROLES" &&
    change.roleIds.includes(superAdminRoleId)
  ) {
    return;
  }

  const activeSuperAdmins = await db.$queryRaw<
    { id: string }[]
  >`SELECT u.id
    FROM "User" u
    JOIN "UserRole" ur ON ur."userId" = u.id
    WHERE ur."roleId" = ${superAdminRoleId}
      AND u.status = 'ACTIVE'`;

  const targetIsActiveSuperAdmin =
    activeSuperAdmins.some(
      (row) => row.id === targetId,
    );

  const isSelf =
    actorId !== undefined && actorId === targetId;

  if (
    !targetIsActiveSuperAdmin &&
    !(isSelf && change.kind !== "SET_ROLES")
  ) {
    return;
  }

  if (isSelf) {
    throw new UserSafetyError(
      "CANNOT_MODIFY_OWN_ACCOUNT",
      change.kind === "DELETE"
        ? "You cannot delete your own account"
        : change.kind === "DEACTIVATE"
          ? "You cannot deactivate your own account"
          : "You cannot remove the Super Admin role from your own account",
      403,
    );
  }

  const otherActiveSuperAdmins =
    activeSuperAdmins.filter(
      (row) => row.id !== targetId,
    );

  if (otherActiveSuperAdmins.length === 0) {
    throw new UserSafetyError(
      "LAST_SUPER_ADMIN_PROTECTED",
      "The last active Super Admin cannot be deactivated, deleted or demoted",
      409,
    );
  }
}
