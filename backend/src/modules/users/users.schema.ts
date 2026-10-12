import { z } from "zod";

export const createUserSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Please enter a valid email address"),

  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must not exceed 100 characters"),

  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(100, "Password must not exceed 100 characters"),

  roleIds: z
    .array(z.string().uuid())
    .min(1, "At least one role is required"),
});

export const updateUserSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Please enter a valid email address")
    .optional(),

  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must not exceed 100 characters")
    .optional(),

  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(100, "Password must not exceed 100 characters")
    .optional(),

  status: z
    .enum(["ACTIVE", "INACTIVE"])
    .optional(),

  roleIds: z
    .array(z.string().uuid())
    .min(1, "At least one role is required")
    .optional(),
});

export const userIdSchema = z.object({
  id: z.string().uuid("Invalid user ID"),
});

export const userListQuerySchema = z.object({
  search: z
    .string()
    .trim()
    .optional(),

  status: z
    .enum(["ACTIVE", "INACTIVE"])
    .optional(),

  page: z.coerce
    .number()
    .int()
    .min(1)
    .default(1),

  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20),
});

export type CreateUserInput = z.infer<
  typeof createUserSchema
>;

export type UpdateUserInput = z.infer<
  typeof updateUserSchema
>;

export type UserListQuery = z.infer<
  typeof userListQuerySchema
>;