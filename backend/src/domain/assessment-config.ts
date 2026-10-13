

export const INTERVIEW_DURATION_MINUTES = 30;

export const TOPICS = [
  { key: "oop", title: "OOPs" },
  { key: "html", title: "HTML" },
  { key: "css", title: "CSS" },
  { key: "javascript", title: "JavaScript" },
] as const;

export const TOPIC_KEYS: readonly string[] = TOPICS.map((t) => t.key);

export function isTopicKey(value: string): boolean {
  return TOPIC_KEYS.includes(value);
}

// Confirmed recruitment requirements: every UG assessment is exactly 45 questions,
// 60 marks and 60 minutes; every PG assessment is exactly 75 questions and 75
// minutes. The PG total marks are still the template author's choice (null), as
// they were before the durations were fixed.
export const LEVEL_RULES = {
  UG: { questionCount: 45, totalMarks: 60 as number | null, durationMinutes: 60 },

  PG: { questionCount: 75, totalMarks: null as number | null, durationMinutes: 75 },
} as const;

export function fixedDurationFor(level: "UG" | "PG"): number {
  return LEVEL_RULES[level].durationMinutes;
}

export const PROPOSED_UG_MARKS = {
  oop: { count: 10, marksPerQuestion: 1 },
  html: { count: 10, marksPerQuestion: 1 },
  css: { count: 10, marksPerQuestion: 1 },
  javascript: { count: 15, marksPerQuestion: 2 },
} as const;

export const PROPOSED_PG_COUNTS = {
  oop: 15,
  html: 15,
  css: 15,
  javascript: 30,
} as const;

export type TemplateSectionInput = {
  key: string;
  title: string;
  questionCount: number;
  marksPerQuestion: number;
};

export type TemplateConfigInput = {
  level: "UG" | "PG";
  durationMinutes: number;
  difficulty: { easyPct: number; mediumPct: number; hardPct: number };
  negativeMarking: number;
  sections: readonly TemplateSectionInput[];
};

export type ConfigIssue = { field: string; message: string };

export function validateTemplateConfig(
  input: TemplateConfigInput,
): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  const rule = LEVEL_RULES[input.level];

  if (input.durationMinutes !== rule.durationMinutes) {
    issues.push({
      field: "durationMinutes",
      message: `${input.level} assessments are fixed at ${rule.durationMinutes} minutes`,
    });
  }

  const { easyPct, mediumPct, hardPct } = input.difficulty;

  if (
    ![easyPct, mediumPct, hardPct].every(
      (n) => Number.isInteger(n) && n >= 0 && n <= 100,
    ) ||
    easyPct + mediumPct + hardPct !== 100
  ) {
    issues.push({
      field: "difficulty",
      message: "Difficulty percentages must be whole numbers that total 100",
    });
  }

  if (!(input.negativeMarking >= 0)) {
    issues.push({
      field: "negativeMarking",
      message: "Negative marking cannot be negative",
    });
  }

  if (input.sections.length === 0) {
    issues.push({ field: "sections", message: "At least one section is required" });
  }

  const seen = new Set<string>();
  let questions = 0;
  let marks = 0;

  input.sections.forEach((section, index) => {
    const at = `sections.${index}`;

    if (!isTopicKey(section.key)) {
      issues.push({
        field: `${at}.key`,
        message: `Section must be one of: ${TOPIC_KEYS.join(", ")}`,
      });
    }

    if (seen.has(section.key)) {
      issues.push({ field: `${at}.key`, message: "Each section can appear only once" });
    }

    seen.add(section.key);

    if (!Number.isInteger(section.questionCount) || section.questionCount < 1) {
      issues.push({
        field: `${at}.questionCount`,
        message: "Question count must be a whole number of at least 1",
      });
    }

    if (!(section.marksPerQuestion > 0)) {
      issues.push({
        field: `${at}.marksPerQuestion`,
        message: "Marks per question must be greater than 0",
      });
    }

    questions += section.questionCount;
    marks += section.questionCount * section.marksPerQuestion;
  });

  if (questions !== rule.questionCount) {
    issues.push({
      field: "sections",
      message: `${input.level} must have exactly ${rule.questionCount} questions (currently ${questions})`,
    });
  }

  if (rule.totalMarks !== null && marks !== rule.totalMarks) {
    issues.push({
      field: "sections",
      message: `${input.level} must total exactly ${rule.totalMarks} marks (currently ${marks})`,
    });
  }

  if (!Number.isInteger(marks) || marks <= 0) {
    issues.push({
      field: "sections",
      message: "Section marks must add up to a whole number above 0",
    });
  }

  return issues;
}

export function templateTotals(sections: readonly TemplateSectionInput[]) {
  return {
    questionCount: sections.reduce((n, s) => n + s.questionCount, 0),
    totalMarks: sections.reduce((n, s) => n + s.questionCount * s.marksPerQuestion, 0),
  };
}
