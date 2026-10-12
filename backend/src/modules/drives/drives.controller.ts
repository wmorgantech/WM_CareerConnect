import type { Request, Response } from "express";

import { getAuditActor } from "../../lib/audit.js";
import {
  createDriveSchema,
  updateDriveSchema,
  driveIdSchema,
  driveListQuerySchema,
} from "./drives.schema.js";

import {
  listDrives,
  getDriveById,
  createDrive,
  updateDrive,
  deleteDrive,
} from "./drives.service.js";

export async function listDrivesController(
  req: Request,
  res: Response,
) {
  const result = driveListQuerySchema.safeParse(
    req.query,
  );

  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid query parameters",
        details: result.error.flatten(),
      },
    });
  }

  const drives = await listDrives(result.data);

  return res.status(200).json({
    success: true,
    data: drives.data,
    pagination: drives.pagination,
  });
}

export async function getDriveController(
  req: Request,
  res: Response,
) {
  const result = driveIdSchema.safeParse(
    req.params,
  );

  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid drive ID",
        details: result.error.flatten(),
      },
    });
  }

  const drive = await getDriveById(
    result.data.id,
  );

  if (!drive) {
    return res.status(404).json({
      success: false,
      error: {
        code: "DRIVE_NOT_FOUND",
        message: "Drive not found",
      },
    });
  }

  return res.status(200).json({
    success: true,
    data: drive,
  });
}

export async function createDriveController(
  req: Request,
  res: Response,
) {
  const result = createDriveSchema.safeParse(
    req.body,
  );

  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid drive data",
        details: result.error.flatten(),
      },
    });
  }

  try {
    const drive = await createDrive(
      result.data,
      getAuditActor(req),
    );

    if (!drive) {
      return res.status(404).json({
        success: false,
        error: {
          code: "COLLEGE_NOT_FOUND",
          message:
            "Active college not found",
        },
      });
    }

    return res.status(201).json({
      success: true,
      data: drive,
    });
  } catch (error: unknown) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: {
        code: "DRIVE_CREATE_FAILED",
        message: "Failed to create drive",
      },
    });
  }
}

export async function updateDriveController(
  req: Request,
  res: Response,
) {
  const idResult = driveIdSchema.safeParse(
    req.params,
  );

  if (!idResult.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid drive ID",
        details: idResult.error.flatten(),
      },
    });
  }

  const bodyResult = updateDriveSchema.safeParse(
    req.body,
  );

  if (!bodyResult.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid drive data",
        details: bodyResult.error.flatten(),
      },
    });
  }

  try {
    const drive = await updateDrive(
      idResult.data.id,
      bodyResult.data,
      getAuditActor(req),
    );

    if (!drive) {
      return res.status(404).json({
        success: false,
        error: {
          code: "DRIVE_NOT_FOUND",
          message:
            "Drive or active college not found",
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: drive,
    });
  } catch (error: unknown) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: {
        code: "DRIVE_UPDATE_FAILED",
        message: "Failed to update drive",
      },
    });
  }
}

export async function deleteDriveController(
  req: Request,
  res: Response,
) {
  const result = driveIdSchema.safeParse(
    req.params,
  );

  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid drive ID",
        details: result.error.flatten(),
      },
    });
  }

  try {
    const drive = await deleteDrive(
      result.data.id,
      getAuditActor(req),
    );

    if (!drive) {
      return res.status(404).json({
        success: false,
        error: {
          code: "DRIVE_NOT_FOUND",
          message: "Drive not found",
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: drive,
    });
  } catch (error: unknown) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: {
        code: "DRIVE_DELETE_FAILED",
        message: "Failed to delete drive",
      },
    });
  }
}