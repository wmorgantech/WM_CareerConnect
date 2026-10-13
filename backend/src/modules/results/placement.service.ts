import { z } from "zod";

import { rdb } from "../../lib/recruitment-db.js";
import { buildRows, resultsQuerySchema, type ResultRow, type Viewer } from "./results.service.js";

type Row = Record<string, any>;

// The placement views are read-only summaries built on the same college-scoped rows as the results pages
// (buildRows applies the viewer's college scope first), so a count, a list or a filter can never include a
// student outside the viewer's colleges.
//
// Business rules, all taken from the stored application status and its history (nothing is guessed):
//   * Qualified for the next round: the student was shortlisted after the assessment, that is, the status is
//     SHORTLISTED or later in the pipeline, or the student was rejected after having been shortlisted or
//     interviewed.
//   * Not qualified: rejected without ever having been shortlisted or interviewed.
//   * Pending: still registered, taking the test, or waiting for the shortlisting decision.
//   * Final: SELECTED is selected; REJECTED after qualifying is not selected; everything else is pending.
export const PIPELINE = ["SHORTLISTED", "INTERVIEW_SCHEDULED", "INTERVIEW_COMPLETED", "ON_HOLD", "SELECTED"] as const;

export type AssessmentDecision = "QUALIFIED" | "NOT_QUALIFIED" | "PENDING";
export type FinalDecision = "SELECTED" | "NOT_SELECTED" | "PENDING";

export const placementQuerySchema = resultsQuerySchema.omit({ status: true }).extend({
  decision: z.enum(["QUALIFIED", "NOT_QUALIFIED", "PENDING", "SELECTED", "NOT_SELECTED"]).optional(),
});

export type PlacementQuery = z.infer<typeof placementQuerySchema>;

type Enriched = ResultRow & {
  assessmentDecision: AssessmentDecision;
  finalDecision: FinalDecision;
  inPipeline: boolean;
  interview: { round: string | null; status: string; scheduledAt: Date; count: number } | null;
};

async function enrich(viewer: Viewer, query: PlacementQuery): Promise<Enriched[]> {
  const { rows } = await buildRows(viewer, {
    driveId: query.driveId,
    collegeId: query.collegeId,
    level: query.level,
    search: query.search,
  });

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.applicationId);
  const db = rdb();
  const [history, interviews]: [Row[], Row[]] = await Promise.all([
    db.applicationStatusHistory.findMany({ where: { applicationId: { in: ids } } }),
    db.interview.findMany({ where: { applicationId: { in: ids } } }),
  ]);
  const shortlisted = new Set(history.filter((h) => h.toStatus === "SHORTLISTED").map((h) => h.applicationId as string));
  const live = interviews.filter((i) => i.status !== "CANCELLED");
  const interviewed = new Set(live.map((i) => i.applicationId as string));

  return rows.map((row) => {
    const status = row.applicationStatus;
    const inPipeline = (PIPELINE as readonly string[]).includes(status);
    const qualified = inPipeline || (status === "REJECTED" && (shortlisted.has(row.applicationId) || interviewed.has(row.applicationId)));
    const assessmentDecision: AssessmentDecision = qualified ? "QUALIFIED" : status === "REJECTED" ? "NOT_QUALIFIED" : "PENDING";
    const finalDecision: FinalDecision = status === "SELECTED" ? "SELECTED" : qualified && status === "REJECTED" ? "NOT_SELECTED" : "PENDING";
    const mine = live.filter((i) => i.applicationId === row.applicationId).sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime());
    const latest = mine[0];

    return {
      ...row,
      assessmentDecision,
      finalDecision,
      inPipeline,
      interview: latest ? { round: (latest.roundName ?? null) as string | null, status: latest.status as string, scheduledAt: latest.scheduledAt as Date, count: mine.length } : null,
    };
  });
}

function page<T>(items: T[], query: PlacementQuery) {
  const total = items.length;

  return {
    data: items.slice((query.page - 1) * query.limit, query.page * query.limit),
    pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
  };
}

export async function placementOverview(viewer: Viewer, query: PlacementQuery) {
  const rows = await enrich(viewer, query);
  const count = (test: (r: Enriched) => boolean) => rows.filter(test).length;
  const finished = (r: Enriched) => r.attemptStatus === "SUBMITTED" || r.attemptStatus === "AUTO_SUBMITTED";

  return {
    registered: rows.length,
    assessmentAttended: count((r) => r.attemptStatus !== "NOT_STARTED"),
    assessmentCompleted: count(finished),
    qualified: count((r) => r.assessmentDecision === "QUALIFIED"),
    notQualified: count((r) => r.assessmentDecision === "NOT_QUALIFIED"),
    assessmentPending: count((r) => r.assessmentDecision === "PENDING"),
    interviewShortlisted: count((r) => r.inPipeline),
    finalSelected: count((r) => r.finalDecision === "SELECTED"),
    finalNotSelected: count((r) => r.finalDecision === "NOT_SELECTED"),
    finalPending: count((r) => r.assessmentDecision === "QUALIFIED" && r.finalDecision === "PENDING"),
  };
}

const student = (r: Enriched) => ({
  applicationId: r.applicationId,
  applicationNo: r.applicationNo,
  name: r.name,
  college: r.college,
  drive: r.drive,
  level: r.level,
});

export async function assessmentList(viewer: Viewer, query: PlacementQuery) {
  const rows = (await enrich(viewer, query)).filter((r) => !query.decision || r.assessmentDecision === query.decision);

  return page(
    rows.map((r) => ({ ...student(r), attemptStatus: r.attemptStatus, score: r.score, maxScore: r.maxScore, percentage: r.percentage, submittedAt: r.submittedAt, decision: r.assessmentDecision })),
    query,
  );
}

export async function interviewList(viewer: Viewer, query: PlacementQuery) {
  const rows = (await enrich(viewer, query)).filter((r) => r.inPipeline);

  return page(
    rows.map((r) => ({
      ...student(r),
      applicationStatus: r.applicationStatus,
      round: r.interview?.round ?? null,
      interviewStatus: r.interview?.status ?? null,
      scheduledAt: r.interview?.scheduledAt ?? null,
      interviews: r.interview?.count ?? 0,
    })),
    query,
  );
}

export async function finalList(viewer: Viewer, query: PlacementQuery) {
  const rows = (await enrich(viewer, query)).filter((r) => r.assessmentDecision === "QUALIFIED" && (!query.decision || r.finalDecision === query.decision));

  return page(rows.map((r) => ({ ...student(r), applicationStatus: r.applicationStatus, decision: r.finalDecision })), query);
}
