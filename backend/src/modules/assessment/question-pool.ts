import { rdb } from "../../lib/recruitment-db.js";

type Row = Record<string, any>;

export type UsableQuestion = {
  id: string;
  section: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  text: string;
  codeSnippet: string | null;

  options: { id: string; text: string }[];
  optionIds: string[];
  correctOptionId: string;
};

export async function loadUsablePool(
  level: "UG" | "PG",
  sectionKeys: readonly string[],
): Promise<UsableQuestion[]> {
  if (sectionKeys.length === 0) return [];

  const db = rdb();
  const questions: Row[] = await db.question.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      level: { in: [level, "BOTH"] },
      section: { in: [...sectionKeys] },
    },
  });

  if (questions.length === 0) return [];

  const options: Row[] = await db.questionOption.findMany({
    where: { questionId: { in: questions.map((q) => q.id) } },
  });
  const usable: UsableQuestion[] = [];

  for (const q of questions) {
    const own = options
      .filter((o) => o.questionId === q.id)
      .sort((a, b) => a.position - b.position);
    const correct = own.filter((o) => o.isCorrect);

    if (own.length !== 4 || correct.length !== 1) continue;

    usable.push({
      id: q.id,
      section: q.section,
      difficulty: q.difficulty,
      text: q.text,
      codeSnippet: q.codeSnippet ?? null,
      options: own.map((o) => ({ id: o.id, text: o.text })),
      optionIds: own.map((o) => o.id),
      correctOptionId: (correct[0] as Row).id,
    });
  }

  return usable;
}
