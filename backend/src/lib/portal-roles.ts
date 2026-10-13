import type { Request } from "express";

import { CLIENT_HEADER } from "./refresh-cookie.js";

const ADMIN_ROLES = ["SUPER_ADMIN", "HR_ADMIN", "CAMPUS_COORDINATOR", "INTERVIEWER"];
const SCOPED_ROLES = ["HOD", "STAFF"];

export function clientNameFromHeader(
  header: string | string[] | undefined,
): string {
  const value = Array.isArray(header) ? header[0] : header;

  return value?.trim().toLowerCase() ?? "";
}

export function rolesAllowedForClient(
  client: string,
  roles: readonly string[],
): boolean {
  switch (client) {
    case "admin":
      return roles.some((r) => ADMIN_ROLES.includes(r));
    case "hod":
      return roles.includes("HOD");
    case "staff-portal":
      return roles.includes("STAFF");
    default:
      return roles.some((r) => !SCOPED_ROLES.includes(r));
  }
}

export function portalOptionsFor(req: Request) {
  const client = clientNameFromHeader(req.headers[CLIENT_HEADER]);

  return {
    roleCheck: (roles: readonly string[]) => rolesAllowedForClient(client, roles),
  };
}
