import { z } from "zod";

export const createCollegeSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "College name must be at least 2 characters")
    .max(200, "College name must not exceed 200 characters"),

  city: z
    .string()
    .trim()
    .min(2, "City must be at least 2 characters")
    .max(100, "City must not exceed 100 characters"),

  contactPerson: z
    .string()
    .trim()
    .max(100, "Contact person must not exceed 100 characters")
    .optional(),

  phone: z
    .string()
    .trim()
    .max(20, "Phone number must not exceed 20 characters")
    .optional(),

  email: z
    .string()
    .trim()
    .email("Please enter a valid email address")
    .optional(),

  isActive: z
    .boolean()
    .default(true),
});

export const updateCollegeSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "College name must be at least 2 characters")
    .max(200, "College name must not exceed 200 characters")
    .optional(),

  city: z
    .string()
    .trim()
    .min(2, "City must be at least 2 characters")
    .max(100, "City must not exceed 100 characters")
    .optional(),

  contactPerson: z
    .string()
    .trim()
    .max(100, "Contact person must not exceed 100 characters")
    .optional(),

  phone: z
    .string()
    .trim()
    .max(20, "Phone number must not exceed 20 characters")
    .optional(),

  email: z
    .string()
    .trim()
    .email("Please enter a valid email address")
    .optional(),

  isActive: z
    .boolean()
    .optional(),
});

export const collegeIdSchema = z.object({
  id: z.string().uuid("Invalid college ID"),
});

export const collegeListQuerySchema = z.object({
  search: z
    .string()
    .trim()
    .optional(),

  city: z
    .string()
    .trim()
    .optional(),

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

export type CreateCollegeInput = z.infer<
  typeof createCollegeSchema
>;

export type UpdateCollegeInput = z.infer<
  typeof updateCollegeSchema
>;

export type CollegeListQuery = z.infer<
  typeof collegeListQuerySchema
>;