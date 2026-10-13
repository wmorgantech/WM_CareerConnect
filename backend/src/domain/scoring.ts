

export type PaperQuestion = {
  questionId: string;
  section: string;
  marks?: number;
};

export type SectionScore = {
  section: string;
  score: number;
  max: number;
  answered: number;
  correct: number;
};

export type AttemptScore = {
  total: number;
  max: number;
  percentage: number;
  sections: SectionScore[];
};

export function scoreAttempt(input: {
  paper: readonly PaperQuestion[];

  answerKey: ReadonlyMap<string, string>;

  answers: ReadonlyMap<string, string>;
  marksPerQuestion?: number;

  negativePerWrong?: number;
}): AttemptScore {
  const marks = input.marksPerQuestion ?? 1;
  const negative = input.negativePerWrong ?? 0;

  if (marks <= 0 || negative < 0) {
    throw new Error("Marks must be positive and negative marking not negative");
  }

  const sections = new Map<string, SectionScore>();

  for (const question of input.paper) {
    const questionMarks = question.marks ?? marks;

    if (!(questionMarks > 0)) {
      throw new Error(`Question ${question.questionId} has invalid marks`);
    }

    const key = input.answerKey.get(question.questionId);

    if (key === undefined) {
      throw new Error(`Missing answer key for question ${question.questionId}`);
    }

    const entry =
      sections.get(question.section) ??
      { section: question.section, score: 0, max: 0, answered: 0, correct: 0 };

    entry.max += questionMarks;

    const chosen = input.answers.get(question.questionId);

    if (chosen !== undefined) {
      entry.answered += 1;

      if (chosen === key) {
        entry.correct += 1;
        entry.score += questionMarks;
      } else {
        entry.score -= negative;
      }
    }

    sections.set(question.section, entry);
  }

  const list = [...sections.values()];
  const max = list.reduce((sum, s) => sum + s.max, 0);
  const total = Math.max(
    0,
    list.reduce((sum, s) => sum + s.score, 0),
  );

  return {
    total,
    max,
    percentage: max === 0 ? 0 : Math.round((total / max) * 10000) / 100,
    sections: list,
  };
}

export type RankInput = { id: string; score: number; timeTakenSeconds?: number };

export function rankAttempts(
  items: readonly RankInput[],
): Map<string, number> {
  const sorted = [...items].sort((a, b) => b.score - a.score);
  const ranks = new Map<string, number>();
  let previousScore: number | undefined;
  let rank = 0;

  sorted.forEach((item, index) => {
    if (previousScore === undefined || previousScore !== item.score) {
      rank = index + 1;
    }

    ranks.set(item.id, rank);
    previousScore = item.score;
  });

  return ranks;
}
