import type { Request, Response } from "express";

import { getAuditActor } from "../../lib/audit.js";
import { updateSettingsSchema } from "./settings.schema.js";

import {
  getSettings,
  updateSettings,
} from "./settings.service.js";

export async function getSettingsController(
  _req: Request,
  res: Response,
) {
  const settings = await getSettings();

  return res.status(200).json({
    success: true,
    data: settings,
  });
}

export async function updateSettingsController(
  req: Request,
  res: Response,
) {
  const input = updateSettingsSchema.parse(req.body);

  const settings = await updateSettings(
    input,
    getAuditActor(req),
  );

  return res.status(200).json({
    success: true,
    message: "Settings updated successfully",
    data: settings,
  });
}