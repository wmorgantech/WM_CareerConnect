import { quotas, type Difficulty } from "./test-paper.js";

export type CapacitySection = { key: string; questionCount: number };
export type PoolEntry = { section: string; difficulty: Difficulty };
export type DifficultyPct = { easyPct: number; mediumPct: number; hardPct: number };

export type SectionCapacity = {
  key: string;
  required: number;
  available: number;
  shortage: number;
  bands: Record<Difficulty, { wanted: number; available: number }>;
};

export type CapacityReport = {
  ok: boolean;
  sections: SectionCapacity[];
  warnings: string[];
};

export function computeCapacity(
  sections: readonly CapacitySection[],
  pool: readonly PoolEntry[],
  mix: DifficultyPct,
): CapacityReport {
  const warnings: string[] = [];
  const report: SectionCapacity[] = sections.map((section) => {
    const inSection = pool.filter((q) => q.section === section.key);
    const available = inSection.length;
    const wanted = quotas(section.questionCount, {
      EASY: mix.easyPct,
      MEDIUM: mix.mediumPct,
      HARD: mix.hardPct,
    });
    const count = (d: Difficulty) => inSection.filter((q) => q.difficulty === d).length;
    const bands = {
      EASY: { wanted: wanted.EASY, available: count("EASY") },
      MEDIUM: { wanted: wanted.MEDIUM, available: count("MEDIUM") },
      HARD: { wanted: wanted.HARD, available: count("HARD") },
    };

    for (const band of ["EASY", "MEDIUM", "HARD"] as const) {
      if (available >= section.questionCount && bands[band].available < bands[band].wanted) {
        warnings.push(
          `${section.key}: only ${bands[band].available} ${band.toLowerCase()} question(s) for ${bands[band].wanted} wanted; other difficulties will fill in`,
        );
      }
    }

    return {
      key: section.key,
      required: section.questionCount,
      available,
      shortage: Math.max(0, section.questionCount - available),
      bands,
    };
  });

  return { ok: report.every((s) => s.shortage === 0), sections: report, warnings };
}
