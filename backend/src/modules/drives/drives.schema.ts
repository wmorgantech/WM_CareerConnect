import { z } from "zod";

import {
  END_BEFORE_START_MESSAGE,
  isEndBeforeStart,
} from "../../domain/date-range.js";

function requireOrderedDates(
  value: { startDate?: Date | undefined; endDate?: Date | undefined },
  ctx: z.RefinementCtx,
) {
  if (isEndBeforeStart(value.startDate, value.endDate)) {
    ctx.addIssue({
      code: "custom",
      path: ["endDate"],
      message: END_BEFORE_START_MESSAGE,
    });
  }
}

export const driveStatusSchema = z.enum([
  "DRAFT",
  "PUBLISHED",
  "CLOSED",
  "CANCELLED",
]);

export const createDriveSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Drive title must be at least 2 characters")
    .max(200, "Drive title must not exceed 200 characters"),

  description: z
    .string()
    .trim()
    .max(2000, "Description must not exceed 2000 characters")
    .optional(),

  collegeId: z
    .string()
    .min(1, "College ID is required"),

  status: driveStatusSchema.default("DRAFT"),

  startDate: z
    .coerce
    .date()
    .optional(),

  endDate: z
    .coerce
    .date()
    .optional(),

  isActive: z
    .boolean()
    .default(true),
}).superRefine(requireOrderedDates);

export const updateDriveSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Drive title must be at least 2 characters")
    .max(200, "Drive title must not exceed 200 characters")
    .optional(),

  description: z
    .string()
    .trim()
    .max(2000, "Description must not exceed 2000 characters")
    .optional(),

  collegeId: z
    .string()
    .min(1, "College ID is required")
    .optional(),

  status: driveStatusSchema.optional(),

  startDate: z
    .coerce
    .date()
    .optional(),

  endDate: z
    .coerce
    .date()
    .optional(),

  isActive: z
    .boolean()
    .optional(),
}).superRefine(requireOrderedDates);

export const driveIdSchema = z.object({
  id: z.string().uuid("Invalid drive ID"),
});

export const driveListQuerySchema = z.object({
  search: z
    .string()
    .trim()
    .optional(),

  collegeId: z
    .string()
    .min(1, "College ID is required")
    .optional(),

  status: driveStatusSchema.optional(),

  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
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

export type CreateDriveInput = z.infer<
  typeof createDriveSchema
>;

export type UpdateDriveInput = z.infer<
  typeof updateDriveSchema
>;

export type DriveListQuery = z.infer<
  typeof driveListQuerySchema
>;