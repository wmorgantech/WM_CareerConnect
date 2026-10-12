import type { Request, Response } from "express";

import { listRoles } from "./roles.service.js";

export async function listRolesController(
  _req: Request,
  res: Response,
) {
  const roles = await listRoles();

  return res.status(200).json({
    success: true,
    message: "Roles retrieved successfully",
    data: roles,
  });
}
