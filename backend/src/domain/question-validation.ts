

export const OPTION_COUNT = 4;
export const MAX_QUESTION_TEXT = 2000;
export const MAX_OPTION_TEXT = 500;
export const MAX_SNIPPET = 4000;

export type QuestionIssue = { field: string; message: string };

const normalise = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();

export function checkOptions(
  options: readonly string[],
  correctIndex: number,
): QuestionIssue[] {
  const issues: QuestionIssue[] = [];

  if (options.length !== OPTION_COUNT) {
    issues.push({
      field: "options",
      message: `Exactly ${OPTION_COUNT} options are required`,
    });

    return issues;
  }

  options.forEach((text, index) => {
    if (text.trim().length === 0) {
      issues.push({ field: `options.${index}`, message: "Option text is required" });
    } else if (text.length > MAX_OPTION_TEXT) {
      issues.push({
        field: `options.${index}`,
        message: `Option text must not exceed ${MAX_OPTION_TEXT} characters`,
      });
    }
  });

  const seen = new Map<string, number>();

  options.forEach((text, index) => {
    const key = normalise(text);

    if (key.length === 0) return;

    if (seen.has(key)) {
      issues.push({ field: `options.${index}`, message: "Options must all be different" });
    }

    seen.set(key, index);
  });

  if (
    !Number.isInteger(correctIndex) ||
    correctIndex < 0 ||
    correctIndex >= OPTION_COUNT
  ) {
    issues.push({
      field: "correctIndex",
      message: "Choose exactly one correct option",
    });
  }

  return issues;
}
