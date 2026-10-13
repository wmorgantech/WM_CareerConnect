

export const TOPICS = [
  { value: "oop", label: "OOPs" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "javascript", label: "JavaScript" },
];

export const QUESTION_LEVELS = [
  { value: "UG", label: "UG" },
  { value: "PG", label: "PG" },
  { value: "BOTH", label: "UG and PG" },
];

export const TEST_LEVELS = [
  { value: "UG", label: "UG" },
  { value: "PG", label: "PG" },
];

export const DIFFICULTIES = [
  { value: "EASY", label: "Easy" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HARD", label: "Hard" },
];

// Fixed by the recruitment requirements (the backend enforces the same values):
// UG 45 questions, 60 marks, 60 minutes; PG 75 questions, 75 minutes, marks set by the author.
export const UG_RULE = { questions: 45, marks: 60, minutes: 60 };
export const PG_RULE = { questions: 75, marks: null, minutes: 75 };
export const ruleFor = (level) => (level === "PG" ? PG_RULE : UG_RULE);

const lookup = (list) => (value) => list.find((item) => item.value === value)?.label ?? value;

export const topicLabel = lookup(TOPICS);
export const levelLabel = lookup(QUESTION_LEVELS);
export const difficultyLabel = lookup(DIFFICULTIES);

const STATUS_LABELS = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  SUBMITTED: "Submitted",
  AUTO_SUBMITTED: "Auto-submitted",
};

export const attemptStatusLabel = (value) => STATUS_LABELS[value] ?? value;

export function formatRemaining(seconds) {
  if (seconds === null || seconds === undefined) return "—";

  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);

  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;

  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

export function formatScore(value) {
  if (value === null || value === undefined) return "—";

  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
