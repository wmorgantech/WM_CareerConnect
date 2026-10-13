import express, { Router } from "express";

import { getAuditActor } from "../../lib/audit.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permission.middleware.js";
import {
  createQuestionSchema,
  questionIdSchema,
  questionListQuerySchema,
  questionStatusSchema,
  updateQuestionSchema,
} from "./questions.schema.js";
import {
  IMPORT_COLUMNS,
  importQuestions,
  importSchema,
  importTemplateCsv,
} from "./questions-import.service.js";
import {
  createQuestion,
  deleteQuestion,
  getQuestion,
  listQuestions,
  questionSummary,
  setQuestionStatus,
  updateQuestion,
} from "./questions.service.js";

const router = Router();

router.use(authenticate);
router.use(requirePermission("questions.manage"));

router.get("/", async (req, res) => {
  const result = await listQuestions(questionListQuerySchema.parse(req.query));

  return res.status(200).json({ success: true, ...result });
});

router.get("/summary", async (_req, res) => {
  return res.status(200).json({ success: true, data: await questionSummary() });
});

router.get("/import/template", (_req, res) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="question-import-template.csv"');

  return res.status(200).send(importTemplateCsv());
});

router.post("/import", express.text({ type: ["text/csv", "text/plain"], limit: "1mb" }), async (req, res) => {
  const flag = (name: string, fallback: boolean) =>
    typeof req.query[name] === "string" ? req.query[name] === "true" : fallback;
  const input =
    typeof req.body === "string"
      ? { csv: req.body, dryRun: flag("dryRun", true), activate: flag("activate", false) }
      : (() => {
          const parsed = importSchema.parse(req.body);

          return { rows: parsed.rows, dryRun: parsed.dryRun, activate: parsed.activate };
        })();
  const result = await importQuestions(input, getAuditActor(req));

  return res.status(200).json({ success: true, data: { ...result, columns: IMPORT_COLUMNS } });
});

router.get("/:id", async (req, res) => {
  const { id } = questionIdSchema.parse(req.params);

  return res.status(200).json({ success: true, data: await getQuestion(id) });
});

router.post("/", async (req, res) => {
  const input = createQuestionSchema.parse(req.body);
  const data = await createQuestion(input, getAuditActor(req));

  return res.status(201).json({ success: true, data });
});

router.patch("/:id", async (req, res) => {
  const { id } = questionIdSchema.parse(req.params);
  const input = updateQuestionSchema.parse(req.body);

  return res
    .status(200)
    .json({ success: true, data: await updateQuestion(id, input, getAuditActor(req)) });
});

router.patch("/:id/status", async (req, res) => {
  const { id } = questionIdSchema.parse(req.params);
  const { isActive } = questionStatusSchema.parse(req.body);

  return res
    .status(200)
    .json({ success: true, data: await setQuestionStatus(id, isActive, getAuditActor(req)) });
});

router.delete("/:id", async (req, res) => {
  const { id } = questionIdSchema.parse(req.params);

  await deleteQuestion(id, getAuditActor(req));

  return res.status(200).json({ success: true, message: "Question deleted" });
});

export default router;
