import type { Request, Response } from "express";

import {
  createUserSchema,
  updateUserSchema,
  userIdSchema,
  userListQuerySchema,
} from "./users.schema.js";

import {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  updateUserStatus,
  deleteUser,
} from "./users.service.js";

import { UserSafetyError } from "./user-safety.js";

function respondUserSafetyError(
  error: unknown,
  res: Response,
): boolean {
  if (!(error instanceof UserSafetyError)) {
    return false;
  }

  res.status(error.statusCode).json({
    success: false,
    error: {
      code: error.code,
      message: error.message,
    },
  });

  return true;
}

export async function listUsersController(
  req: Request,
  res: Response,
) {
  const parsed =
    userListQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid user list parameters",
        details: parsed.error.flatten(),
      },
    });
  }

  try {
    const result = await listUsers(parsed.data);

    return res.status(200).json({
      success: true,
      message: "Users retrieved successfully",
      data: result,
    });
  } catch (error) {
    throw error;
  }
}

export async function getUserController(
  req: Request,
  res: Response,
) {
  const parsed = userIdSchema.safeParse(req.params);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid user ID",
        details: parsed.error.flatten(),
      },
    });
  }

  try {
    const user = await getUserById(parsed.data.id);

    return res.status(200).json({
      success: true,
      message: "User retrieved successfully",
      data: {
        user,
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "User not found"
    ) {
      return res.status(404).json({
        success: false,
        error: {
          code: "USER_NOT_FOUND",
          message: "User not found",
        },
      });
    }

    throw error;
  }
}

export async function createUserController(
  req: Request,
  res: Response,
) {
  const parsed = createUserSchema.safeParse(
    req.body,
  );

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid user details",
        details: parsed.error.flatten(),
      },
    });
  }

  try {
    const user = await createUser(
      parsed.data,
      req.user!.id,
    );

    return res.status(201).json({
      success: true,
      message: "User created successfully",
      data: {
        user,
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "A user with this email already exists"
    ) {
      return res.status(409).json({
        success: false,
        error: {
          code: "USER_ALREADY_EXISTS",
          message:
            "A user with this email already exists",
        },
      });
    }

    if (
      error instanceof Error &&
      error.message ===
        "One or more selected roles do not exist"
    ) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_ROLES",
          message:
            "One or more selected roles do not exist",
        },
      });
    }

    if (respondUserSafetyError(error, res)) {
      return;
    }

    throw error;
  }
}

export async function updateUserController(
  req: Request,
  res: Response,
) {
  const params = userIdSchema.safeParse(
    req.params,
  );

  if (!params.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid user ID",
        details: params.error.flatten(),
      },
    });
  }

  const body = updateUserSchema.safeParse(
    req.body,
  );

  if (!body.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid user details",
        details: body.error.flatten(),
      },
    });
  }

  try {
    const user = await updateUser(
      params.data.id,
      body.data,
      req.user!.id,
    );

    return res.status(200).json({
      success: true,
      message: "User updated successfully",
      data: {
        user,
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "User not found"
    ) {
      return res.status(404).json({
        success: false,
        error: {
          code: "USER_NOT_FOUND",
          message: "User not found",
        },
      });
    }

    if (
      error instanceof Error &&
      error.message ===
        "A user with this email already exists"
    ) {
      return res.status(409).json({
        success: false,
        error: {
          code: "USER_ALREADY_EXISTS",
          message:
            "A user with this email already exists",
        },
      });
    }

    if (
      error instanceof Error &&
      error.message ===
        "One or more selected roles do not exist"
    ) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_ROLES",
          message:
            "One or more selected roles do not exist",
        },
      });
    }

    if (respondUserSafetyError(error, res)) {
      return;
    }

    throw error;
  }
}

export async function updateUserStatusController(
  req: Request,
  res: Response,
) {
  const params = userIdSchema.safeParse(
    req.params,
  );

  if (!params.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid user ID",
        details: params.error.flatten(),
      },
    });
  }

  const statusSchema = updateUserSchema.pick({
    status: true,
  });

  const body = statusSchema.safeParse(req.body);

  if (
    !body.success ||
    !body.data.status
  ) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message:
          "Status must be ACTIVE or INACTIVE",
        details: body.success
          ? undefined
          : body.error.flatten(),
      },
    });
  }

  try {
    const user = await updateUserStatus(
      params.data.id,
      body.data.status,
      req.user!.id,
    );

    return res.status(200).json({
      success: true,
      message: "User status updated successfully",
      data: {
        user,
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "User not found"
    ) {
      return res.status(404).json({
        success: false,
        error: {
          code: "USER_NOT_FOUND",
          message: "User not found",
        },
      });
    }

    if (respondUserSafetyError(error, res)) {
      return;
    }

    throw error;
  }
}

export async function deleteUserController(
  req: Request,
  res: Response,
) {
  const parsed = userIdSchema.safeParse(req.params);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid user ID",
        details: parsed.error.flatten(),
      },
    });
  }

  try {
    await deleteUser(
      parsed.data.id,
      req.user!.id,
    );

    return res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    if (respondUserSafetyError(error, res)) {
      return;
    }

    if (
      error instanceof Error &&
      error.message === "User not found"
    ) {
      return res.status(404).json({
        success: false,
        error: {
          code: "USER_NOT_FOUND",
          message: "User not found",
        },
      });
    }

    throw error;
  }
}