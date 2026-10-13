

export type Difficulty = "EASY" | "MEDIUM" | "HARD";

export type PoolQuestion = {
  id: string;
  section: string;
  difficulty: Difficulty;
  optionIds: readonly string[];
};

export type SectionSpec = { section: string; marks: number };

export type DifficultyMix = Record<Difficulty, number>;

export const DEFAULT_DIFFICULTY_MIX: DifficultyMix = {
  EASY: 0.4,
  MEDIUM: 0.4,
  HARD: 0.2,
};

export type PaperItem = {
  questionId: string;
  section: string;
  position: number;
  optionOrder: string[];
};

export class InsufficientQuestionsError extends Error {
  readonly section: string;
  readonly required: number;
  readonly available: number;

  constructor(section: string, required: number, available: number) {
    super(
      `Section "${section}" needs ${required} questions but only ${available} are available`,
    );
    this.name = "InsufficientQuestionsError";
    this.section = section;
    this.required = required;
    this.available = available;
  }
}

export type Rng = () => number;

export function seededRng(seed: number): Rng {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function cryptoRng(): Rng {
  return () => {
    const bytes = new Uint32Array(1);

    globalThis.crypto.getRandomValues(bytes);

    return (bytes[0] ?? 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const a = result[i] as T;

    result[i] = result[j] as T;
    result[j] = a;
  }

  return result;
}

export function quotas(total: number, mix: DifficultyMix): DifficultyMix {
  const keys: Difficulty[] = ["EASY", "MEDIUM", "HARD"];
  const weightSum = keys.reduce((sum, key) => sum + mix[key], 0);

  if (!(weightSum > 0) || keys.some((key) => mix[key] < 0)) {
    throw new Error("Difficulty mix must be non-negative and not all zero");
  }

  const raw = keys.map((key) => (mix[key] / weightSum) * total);
  const base = raw.map(Math.floor);
  let left = total - base.reduce((a, b) => a + b, 0);

  const order = raw
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);

  for (const { index } of order) {
    if (left <= 0) {
      break;
    }

    base[index] = (base[index] ?? 0) + 1;
    left -= 1;
  }

  return { EASY: base[0] ?? 0, MEDIUM: base[1] ?? 0, HARD: base[2] ?? 0 };
}

function pickFromSection(
  pool: readonly PoolQuestion[],
  used: Set<string>,
  section: string,
  count: number,
  mix: DifficultyMix,
  rng: Rng,
): PoolQuestion[] {
  const candidates = pool.filter(
    (q) => q.section === section && !used.has(q.id),
  );

  if (candidates.length < count) {
    throw new InsufficientQuestionsError(section, count, candidates.length);
  }

  const byDifficulty: Record<Difficulty, PoolQuestion[]> = {
    EASY: shuffled(
      candidates.filter((q) => q.difficulty === "EASY"),
      rng,
    ),
    MEDIUM: shuffled(
      candidates.filter((q) => q.difficulty === "MEDIUM"),
      rng,
    ),
    HARD: shuffled(
      candidates.filter((q) => q.difficulty === "HARD"),
      rng,
    ),
  };

  const want = quotas(count, mix);
  const chosen: PoolQuestion[] = [];

  for (const key of ["EASY", "MEDIUM", "HARD"] as const) {
    chosen.push(...byDifficulty[key].splice(0, want[key]));
  }

if (chosen.length < count) {
    const rest = shuffled(
      [...byDifficulty.EASY, ...byDifficulty.MEDIUM, ...byDifficulty.HARD],
      rng,
    );

    chosen.push(...rest.splice(0, count - chosen.length));
  }

  return shuffled(chosen, rng);
}

export function generatePaper(input: {
  pool: readonly PoolQuestion[];
  sections: readonly SectionSpec[];
  mix?: DifficultyMix;
  rng?: Rng;
}): PaperItem[] {
  const rng = input.rng ?? cryptoRng();
  const mix = input.mix ?? DEFAULT_DIFFICULTY_MIX;
  const items: PaperItem[] = [];
  const used = new Set<string>();
  let position = 1;

  for (const spec of input.sections) {
    if (!Number.isInteger(spec.marks) || spec.marks < 0) {
      throw new Error(`Section "${spec.section}" has invalid marks`);
    }

    for (const question of pickFromSection(
      input.pool,
      used,
      spec.section,
      spec.marks,
      mix,
      rng,
    )) {
      used.add(question.id);
      items.push({
        questionId: question.id,
        section: spec.section,
        position,
        optionOrder: shuffled(question.optionIds, rng),
      });
      position += 1;
    }
  }

  return items;
}

export type CountedSectionSpec = {
  section: string;
  count: number;
  marksPerQuestion: number;
};

export type WeightedPaperItem = PaperItem & { marks: number };

export function generateWeightedPaper(input: {
  pool: readonly PoolQuestion[];
  sections: readonly CountedSectionSpec[];
  mix?: DifficultyMix;
  rng?: Rng;
}): WeightedPaperItem[] {
  const rng = input.rng ?? cryptoRng();
  const mix = input.mix ?? DEFAULT_DIFFICULTY_MIX;
  const items: WeightedPaperItem[] = [];
  const used = new Set<string>();
  let position = 1;

  for (const spec of input.sections) {
    if (!Number.isInteger(spec.count) || spec.count < 0) {
      throw new Error(`Section "${spec.section}" has an invalid question count`);
    }

    if (!(spec.marksPerQuestion > 0)) {
      throw new Error(`Section "${spec.section}" has invalid marks per question`);
    }

    for (const question of pickFromSection(
      input.pool,
      used,
      spec.section,
      spec.count,
      mix,
      rng,
    )) {
      used.add(question.id);
      items.push({
        questionId: question.id,
        section: spec.section,
        position,
        optionOrder: shuffled(question.optionIds, rng),
        marks: spec.marksPerQuestion,
      });
      position += 1;
    }
  }

  return items;
}
