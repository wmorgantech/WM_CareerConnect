import assert from "node:assert/strict";
import test from "node:test";
import { getFormIssues } from "../src/utils/form-issues.js";

test("preserves readiness issue codes, levels, and exact API messages", () => {
  const issues = [
    {
      level: "UG",
      code: "TEMPLATE_NOT_CONFIGURED",
      message: "No UG test template is assigned",
    },
  ];

  assert.deepEqual(getFormIssues({ details: { issues } }), issues);
});

test("ignores malformed API readiness issues", () => {
  assert.deepEqual(
    getFormIssues({
      details: {
        issues: [
          null,
          { code: "MISSING_MESSAGE" },
          { message: "Missing code" },
          { code: " ", message: "" },
          { code: "QUESTION_BANK_INSUFFICIENT", message: "UG Algebra needs 4 questions" },
        ],
      },
    }),
    [{ code: "QUESTION_BANK_INSUFFICIENT", message: "UG Algebra needs 4 questions" }],
  );
});
