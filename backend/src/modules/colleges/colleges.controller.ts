import type { Request, Response } from "express";

import {
  collegeIdSchema,
  createCollegeSchema,
  updateCollegeSchema,
  collegeListQuerySchema,
} from "./colleges.schema.js";

import {
  listColleges,
  getCollegeById,
  createCollege,
  updateCollege,
  deleteCollege,
} from "./colleges.service.js";

export async function listCollegesController(
  req: Request,
  res: Response,
) {
  const result = collegeListQuerySchema.safeParse(
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

  const colleges = await listColleges(result.data);

  return res.status(200).json({
    success: true,
    data: colleges.data,
    pagination: colleges.pagination,
  });
}

export async function getCollegeController(
  req: Request,
  res: Response,
) {
  const result = collegeIdSchema.safeParse(
    req.params,
  );

  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid college ID",
        details: result.error.flatten(),
      },
    });
  }

  const college = await getCollegeById(
    result.data.id,
  );

  if (!college) {
    return res.status(404).json({
      success: false,
      error: {
        code: "COLLEGE_NOT_FOUND",
        message: "College not found",
      },
    });
  }

  return res.status(200).json({
    success: true,
    data: college,
  });
}

export async function createCollegeController(
  req: Request,
  res: Response,
) {
  const result = createCollegeSchema.safeParse(
    req.body,
  );

  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid college data",
        details: result.error.flatten(),
      },
    });
  }

  try {
    const college = await createCollege(
      result.data,
      req.user!.id,
    );

    return res.status(201).json({
      success: true,
      data: college,
    });
  } catch (error: unknown) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: {
        code: "COLLEGE_CREATE_FAILED",
        message: "Failed to create college",
      },
    });
  }
}

export async function updateCollegeController(
  req: Request,
  res: Response,
) {
  const idResult = collegeIdSchema.safeParse(
    req.params,
  );

  if (!idResult.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid college ID",
        details: idResult.error.flatten(),
      },
    });
  }

  const bodyResult = updateCollegeSchema.safeParse(
    req.body,
  );

  if (!bodyResult.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid college data",
        details: bodyResult.error.flatten(),
      },
    });
  }

  try {
    const college = await updateCollege(
      idResult.data.id,
      bodyResult.data,
      req.user!.id,
    );

    if (!college) {
      return res.status(404).json({
        success: false,
        error: {
          code: "COLLEGE_NOT_FOUND",
          message: "College not found",
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: college,
    });
  } catch (error: unknown) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: {
        code: "COLLEGE_UPDATE_FAILED",
        message: "Failed to update college",
      },
    });
  }
}

export async function deleteCollegeController(
  req: Request,
  res: Response,
) {
  const result = collegeIdSchema.safeParse(
    req.params,
  );

  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid college ID",
        details: result.error.flatten(),
      },
    });
  }

  try {
    const college = await deleteCollege(
      result.data.id,
      req.user!.id,
    );

    if (!college) {
      return res.status(404).json({
        success: false,
        error: {
          code: "COLLEGE_NOT_FOUND",
          message: "College not found",
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: college,
    });
  } catch (error: unknown) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: {
        code: "COLLEGE_DELETE_FAILED",
        message: "Failed to delete college",
      },
    });
  }
}