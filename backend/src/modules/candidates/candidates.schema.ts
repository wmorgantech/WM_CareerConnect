import { z } from "zod";

import { httpUrl } from "../../lib/url.js";

export const createCandidateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Candidate name must be at least 2 characters")
    .max(150, "Candidate name must not exceed 150 characters"),

  email: z
    .string()
    .trim()
    .email("Invalid email address")
    .max(255, "Email must not exceed 255 characters"),

  phone: z
    .string()
    .trim()
    .min(7, "Phone number must be at least 7 characters")
    .max(20, "Phone number must not exceed 20 characters")
    .optional(),

 collegeId: z
    .string()
    .min(1, "Invalid college ID")
    .optional(),

  resumeUrl: httpUrl("Invalid resume URL")
    .max(1000, "Resume URL must not exceed 1000 characters")
    .optional(),

  isActive: z
    .boolean()
    .default(true),
});

export const updateCandidateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Candidate name must be at least 2 characters")
    .max(150, "Candidate name must not exceed 150 characters")
    .optional(),

  email: z
    .string()
    .trim()
    .email("Invalid email address")
    .max(255, "Email must not exceed 255 characters")
    .optional(),

  phone: z
    .string()
    .trim()
    .min(7, "Phone number must be at least 7 characters")
    .max(20, "Phone number must not exceed 20 characters")
    .optional(),

  collegeId: z
    .string()
    .min(1, "Invalid college ID")
    .optional(),

  resumeUrl: httpUrl("Invalid resume URL")
    .max(1000, "Resume URL must not exceed 1000 characters")
    .optional(),

  isActive: z
    .boolean()
    .optional(),
});

export const candidateIdSchema = z.object({
  id: z.string().uuid("Invalid candidate ID"),
});

export const candidateListQuerySchema = z.object({
  search: z
    .string()
    .trim()
    .optional(),

  collegeId: z
    .string()
    .min(1, "Invalid college ID")
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

export type CreateCandidateInput = z.infer<
  typeof createCandidateSchema
>;

export type UpdateCandidateInput = z.infer<
  typeof updateCandidateSchema
>;

export type CandidateListQuery = z.infer<
  typeof candidateListQuerySchema
>;