import { z } from "zod";

export const reportTypeSchema = z.enum([
  "CANDIDATES",
  "INTERVIEWS",
  "RESULTS",
]);

export const reportQuerySchema = z.object({
  type: reportTypeSchema.default("CANDIDATES"),

  driveId: z
    .string()
    .uuid("Invalid drive ID")
    .optional(),

  collegeId: z
    .string()
    .min(1, "Invalid college ID")
    .optional(),

  status: z
    .string()
    .trim()
    .min(1, "Invalid status")
    .optional(),

  fromDate: z.coerce
    .date()
    .optional(),

  toDate: z.coerce
    .date()
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
}).superRefine((value, ctx) => {
  if (
    value.fromDate &&
    value.toDate &&
    value.fromDate > value.toDate
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["fromDate"],
      message: "From date must be before or equal to to date",
    });
  }
});

export type ReportQuery = z.infer<
  typeof reportQuerySchema
>;