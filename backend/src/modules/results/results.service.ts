import { z } from "zod";

import {
  canSeeCollege,
  resolveResultScope,
  type ResultScope,
} from "../../domain/college-scope.js";
import { TOPICS } from "../../domain/assessment-config.js";
import { rankAttempts, scoreAttempt } from "../../domain/scoring.js";
import { createCsv } from "../../lib/csv.js";
import { HttpError } from "../../lib/http-error.js";
import { rdb } from "../../lib/recruitment-db.js";

type Row = Record<string, any>;

export type Viewer = { id: string; roles?: string[] };

export const TOP_N = 10;

export const resultsQuerySchema = z.object({
  driveId: z.string().uuid().optional(),
  collegeId: z.string().uuid().optional(),
  level: z.enum(["UG", "PG"]).optional(),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "AUTO_SUBMITTED"]).optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

export type ResultsQuery = z.infer<typeof resultsQuerySchema>;

export type ResultFilters = {
  driveId?: string | undefined;
  collegeId?: string | undefined;
  level?: "UG" | "PG" | undefined;
  status?: "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED" | "AUTO_SUBMITTED" | undefined;
  search?: string | undefined;
};

export async function scopeFor(viewer: Viewer): Promise<ResultScope> {
  const roles = viewer.roles ?? [];
  const assigned: Row[] = roles.some((r) => r === "HOD" || r === "STAFF")
    ? await rdb().userCollege.findMany({ where: { userId: viewer.id } })
    : [];

  return resolveResultScope(roles, assigned.map((a) => a.collegeId as string));
}

const FINISHED = ["SUBMITTED", "AUTO_SUBMITTED"];

export type ResultRow = {
  applicationId: string;
  applicationNo: string;
  name: string;
  college: { id: string | null; name: string | null };
  drive: { id: string; title: string };
  level: "UG" | "PG";
  applicationStatus: string;
  attemptStatus: "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED" | "AUTO_SUBMITTED";
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  rank: number | null;

highlight: "GREEN" | "YELLOW" | null;
  flaggedForReview: boolean | null;
  submittedAt: Date | null;
};

export async function buildRows(viewer: Viewer, query: ResultFilters) {
  const scope = await scopeFor(viewer);

  if (scope.kind === "NONE") {
    throw new HttpError(403, "FORBIDDEN", "You do not have access to results");
  }

  const db = rdb();
  const apps: Row[] = await db.application.findMany({
    where: {
      ...(query.driveId ? { driveId: query.driveId } : {}),
      ...(query.level ? { level: query.level } : {}),
    },
  });

  if (apps.length === 0) return { scope, rows: [] as ResultRow[] };

  const [drives, candidates, attempts]: [Row[], Row[], Row[]] = await Promise.all([
    db.drive.findMany({ where: { id: { in: [...new Set(apps.map((a) => a.driveId))] } } }),
    db.candidate.findMany({ where: { id: { in: apps.map((a) => a.candidateId) } } }),
    db.testAttempt.findMany({ where: { applicationId: { in: apps.map((a) => a.id) } } }),
  ]);
  const collegeIds = [
    ...new Set([
      ...drives.map((d) => d.collegeId as string),
      ...candidates.map((c) => c.collegeId as string | null).filter((x): x is string => Boolean(x)),
    ]),
  ];
  const colleges: Row[] = await db.college.findMany({ where: { id: { in: collegeIds } } });

const ranks = new Map<string, number>();
  const groups = new Map<string, { id: string; score: number }[]>();

  for (const app of apps) {
    const attempt = attempts.find((t) => t.applicationId === app.id);

    if (attempt && FINISHED.includes(attempt.status) && typeof attempt.score === "number") {
      const key = `${app.driveId}:${app.level}`;

      (groups.get(key) ?? groups.set(key, []).get(key)!).push({ id: app.id, score: attempt.score });
    }
  }

  for (const members of groups.values()) {
    for (const [id, rank] of rankAttempts(members)) ranks.set(id, rank);
  }

  const seesFlags = scope.kind === "ALL";
  const rows: ResultRow[] = [];

  for (const app of apps) {
    const drive = drives.find((d) => d.id === app.driveId) as Row;
    const candidate = candidates.find((c) => c.id === app.candidateId);

    const collegeId: string | null = candidate?.collegeId ?? drive?.collegeId ?? null;

    if (!canSeeCollege(scope, collegeId)) continue;
    if (query.collegeId && collegeId !== query.collegeId) continue;

    const attempt = attempts.find((t) => t.applicationId === app.id);
    const attemptStatus = !attempt ? "NOT_STARTED" : (attempt.status as ResultRow["attemptStatus"]);
    const finished = attempt ? FINISHED.includes(attempt.status) : false;
    const rank = ranks.get(app.id) ?? null;

    if (query.status && attemptStatus !== query.status) continue;

    const name = candidate?.name ?? "";

    if (query.search) {
      const needle = query.search.toLowerCase();

      if (!name.toLowerCase().includes(needle) && !String(app.applicationNo).toLowerCase().includes(needle)) continue;
    }

    rows.push({
      applicationId: app.id,
      applicationNo: app.applicationNo,
      name,
      college: { id: collegeId, name: colleges.find((c) => c.id === collegeId)?.name ?? null },
      drive: { id: drive?.id, title: drive?.title },
      level: app.level,
      applicationStatus: app.status,
      attemptStatus,
      score: finished ? attempt!.score ?? null : null,
      maxScore: finished ? attempt!.maxScore ?? null : null,
      percentage: finished ? attempt!.percentage ?? null : null,
      rank,
      highlight: rank === null ? null : rank <= TOP_N ? "GREEN" : "YELLOW",
      flaggedForReview: seesFlags ? Boolean(attempt?.flaggedForReview) : null,
      submittedAt: finished ? attempt!.submittedAt ?? null : null,
    });
  }

  rows.sort((a, b) => {
    if (a.rank !== null && b.rank !== null) return a.rank - b.rank || a.name.localeCompare(b.name);
    if (a.rank !== null) return -1;
    if (b.rank !== null) return 1;

    return a.name.localeCompare(b.name);
  });

  return { scope, rows };
}

export async function listResults(viewer: Viewer, query: ResultsQuery) {
  const { rows } = await buildRows(viewer, query);
  const total = rows.length;

  return {
    data: rows.slice((query.page - 1) * query.limit, query.page * query.limit),
    pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
    summary: {
      ranked: rows.filter((r) => r.rank !== null).length,
      topN: TOP_N,
      notFinished: rows.filter((r) => r.rank === null).length,
    },
  };
}

export async function rankingFor(
  viewer: Viewer,
  query: { driveId?: string | undefined; level?: "UG" | "PG" | undefined; limit?: number | undefined },
) {
  const { rows } = await buildRows(viewer, { driveId: query.driveId, level: query.level });
  const ranked = rows.filter((r) => r.rank !== null);

  return {
    data: ranked.slice(0, query.limit ?? 100),
    totalRanked: ranked.length,
    topN: TOP_N,
  };
}

const titleFor = (key: string) => TOPICS.find((t) => t.key === key)?.title ?? key;

export async function resultDetail(viewer: Viewer, applicationId: string) {
  const { scope, rows } = await buildRows(viewer, {});

  const row = rows.find((r) => r.applicationId === applicationId);

  if (!row) throw new HttpError(404, "RESULT_NOT_FOUND", "Result not found");

  const db = rdb();
  const attempt: Row | null = await db.testAttempt.findFirst({ where: { applicationId } });
  let sections: { key: string; title: string; score: number; max: number; answered: number; correct: number }[] = [];
  let events: { type: string; at: Date }[] | null = null;

  if (attempt && FINISHED.includes(attempt.status)) {
    const [questions, answers]: [Row[], Row[]] = await Promise.all([
      db.attemptQuestion.findMany({ where: { attemptId: attempt.id } }),
      db.attemptAnswer.findMany({ where: { attemptId: attempt.id } }),
    ]);
    const scored = scoreAttempt({
      paper: questions.map((q) => ({ questionId: q.questionId, section: q.section, marks: q.marks })),
      answerKey: new Map(questions.map((q) => [q.questionId as string, q.correctOptionId as string])),
      answers: new Map(answers.filter((a) => a.selectedOptionId).map((a) => [a.questionId as string, a.selectedOptionId as string])),
    });

sections = scored.sections.map((s) => ({
      key: s.section,
      title: titleFor(s.section),
      score: s.score,
      max: s.max,
      answered: s.answered,
      correct: s.correct,
    }));
  }

if (scope.kind === "ALL" && attempt) {
    const list: Row[] = await db.integrityEvent.findMany({ where: { attemptId: attempt.id }, orderBy: [{ createdAt: "asc" }] });

    events = list.map((e) => ({ type: e.type, at: e.createdAt }));
  }

  return { ...row, sections, integrityEvents: events };
}

export async function exportResults(viewer: Viewer, query: ResultFilters) {
  const { rows } = await buildRows(viewer, query);
  const csv = createCsv(
    ["Rank", "Application No", "Name", "College", "Drive", "Level", "Attempt status", "Score", "Out of", "Percentage"],
    rows.map((r) => [r.rank, r.applicationNo, r.name, r.college.name, r.drive.title, r.level, r.attemptStatus, r.score, r.maxScore, r.percentage]),
  );

  return { csv, rowCount: rows.length, filename: "results.csv" };
}
