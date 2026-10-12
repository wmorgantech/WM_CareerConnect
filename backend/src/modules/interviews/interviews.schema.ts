import { z } from "zod";

import { httpUrl } from "../../lib/url.js";

export const interviewStatusSchema = z.enum([
  "SCHEDULED",
  "COMPLETED",
  "CANCELLED",
]);

export const createInterviewSchema = z.object({
  candidateId: z
    .string()
    .uuid("Invalid candidate ID"),

  interviewerId: z
    .string()
    .uuid("Invalid interviewer ID"),

  scheduledAt: z.coerce
    .date()
    .refine(
      (value) => value.getTime() > Date.now(),
      "Interview date must be in the future",
    ),

  durationMinutes: z
    .number()
    .int()
    .min(15, "Interview duration must be at least 15 minutes")
    .max(480, "Interview duration must not exceed 480 minutes")
    .default(60),

  meetingLink: httpUrl("Invalid meeting link")
    .max(1000, "Meeting link must not exceed 1000 characters")
    .optional(),

  notes: z
    .string()
    .trim()
    .max(2000, "Notes must not exceed 2000 characters")
    .optional(),
});

export const updateInterviewSchema = z.object({
  interviewerId: z
    .string()
    .uuid("Invalid interviewer ID")
    .optional(),

  scheduledAt: z.coerce
    .date()
    .optional(),

  durationMinutes: z
    .number()
    .int()
    .min(15, "Interview duration must be at least 15 minutes")
    .max(480, "Interview duration must not exceed 480 minutes")
    .optional(),

  meetingLink: httpUrl("Invalid meeting link")
    .max(1000, "Meeting link must not exceed 1000 characters")
    .optional(),

  notes: z
    .string()
    .trim()
    .max(2000, "Notes must not exceed 2000 characters")
    .optional(),

  status: interviewStatusSchema.optional(),
});

export const submitInterviewFeedbackSchema = z.object({
  feedback: z
    .string()
    .trim()
    .min(1, "Feedback is required")
    .max(
      5000,
      "Feedback must not exceed 5000 characters",
    ),

  score: z
    .number()
    .int()
    .min(0, "Score must be at least 0")
    .max(100, "Score must not exceed 100"),
});

export const interviewIdSchema = z.object({
  id: z.string().uuid("Invalid interview ID"),
});

export const interviewListQuerySchema = z.object({
  candidateId: z
    .string()
    .uuid("Invalid candidate ID")
    .optional(),

  interviewerId: z
    .string()
    .uuid("Invalid interviewer ID")
    .optional(),

  status: interviewStatusSchema.optional(),

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

export type CreateInterviewInput = z.infer<
  typeof createInterviewSchema
>;

export type UpdateInterviewInput = z.infer<
  typeof updateInterviewSchema
>;

export type SubmitInterviewFeedbackInput = z.infer<
  typeof submitInterviewFeedbackSchema
>;

export type InterviewListQuery = z.infer<
  typeof interviewListQuerySchema
>;

// Query for the interviewer lookup used by the scheduling form.
export const interviewerLookupQuerySchema = z.object({
  search: z
    .string()
    .trim()
    .max(100, "Search must not exceed 100 characters")
    .optional(),

  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(50),
});

export type InterviewerLookupQuery = z.infer<
  typeof interviewerLookupQuerySchema
>;
