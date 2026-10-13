import { z } from "zod";

import { TOPIC_KEYS } from "../../domain/assessment-config.js";
import {
  MAX_QUESTION_TEXT,
  MAX_SNIPPET,
} from "../../domain/question-validation.js";

const level = z.enum(["UG", "PG", "BOTH"]);
const difficulty = z.enum(["EASY", "MEDIUM", "HARD"]);
const section = z
  .string()
  .refine((v) => TOPIC_KEYS.includes(v), {
    message: `Section must be one of: ${TOPIC_KEYS.join(", ")}`,
  });

const text = z
  .string()
  .trim()
  .min(1, "Question text is required")
  .max(MAX_QUESTION_TEXT, `Question text must not exceed ${MAX_QUESTION_TEXT} characters`);

const optional = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must not exceed ${max} characters`)
    .nullish();

const options = z.array(z.string()).length(4, "Exactly 4 options are required");

export const createQuestionSchema = z.object({
  level,
  section,
  topic: optional(100, "Topic"),
  difficulty,
  text,
  codeSnippet: optional(MAX_SNIPPET, "Code snippet"),
  explanation: optional(2000, "Explanation"),
  options,
  correctIndex: z.number().int().min(0).max(3),
  isActive: z.boolean().default(true),
});

export const updateQuestionSchema = z
  .object({
    level: level.optional(),
    section: section.optional(),
    topic: optional(100, "Topic"),
    difficulty: difficulty.optional(),
    text: text.optional(),
    codeSnippet: optional(MAX_SNIPPET, "Code snippet"),
    explanation: optional(2000, "Explanation"),
    options: options.optional(),
    correctIndex: z.number().int().min(0).max(3).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Nothing to update",
  });

export const questionStatusSchema = z.object({ isActive: z.boolean() });

export const questionIdSchema = z.object({
  id: z.string().uuid("Invalid question ID"),
});

export const questionListQuerySchema = z.object({
  search: z.string().trim().optional(),
  level: level.optional(),
  section: z.string().optional(),
  difficulty: difficulty.optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;
export type QuestionListQuery = z.infer<typeof questionListQuerySchema>;
