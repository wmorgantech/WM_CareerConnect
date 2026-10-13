import { HttpError } from "../../lib/http-error.js";
import { rdb, recruitmentClientReady, type RecruitmentClient } from "../../lib/recruitment-db.js";

type Row = Record<string, any>;

const MOVES = {
  SCHEDULED: { from: "SHORTLISTED", to: "INTERVIEW_SCHEDULED", note: "Interview scheduled" },
  COMPLETED: { from: "INTERVIEW_SCHEDULED", to: "INTERVIEW_COMPLETED", note: "Interview completed" },
  CANCELLED: { from: "INTERVIEW_SCHEDULED", to: "SHORTLISTED", note: "Interview cancelled" },
} as const;

export type InterviewEvent = keyof typeof MOVES;

export async function checkLinkable(applicationId: string, candidateId: string): Promise<"OK" | "MISMATCH" | "NOT_SHORTLISTED"> {
  if (!recruitmentClientReady()) throw new HttpError(409, "ASSESSMENT_NOT_AVAILABLE", "Application links are not available until the database is migrated");

  const application: Row | null = await rdb().application.findUnique({ where: { id: applicationId } });

  if (!application || application.candidateId !== candidateId) return "MISMATCH";

  return application.status === "SHORTLISTED" ? "OK" : "NOT_SHORTLISTED";
}

export async function linkInterview(tx: unknown, interviewId: string, applicationId: string) {
  await (tx as RecruitmentClient).interview.update({ where: { id: interviewId }, data: { applicationId } });
  await moveApplication(tx, applicationId, "SCHEDULED");
}

export async function moveApplication(tx: unknown, applicationId: string | null | undefined, event: InterviewEvent) {
  if (!applicationId) return;

  const db = tx as RecruitmentClient;
  const move = MOVES[event];
  const moved = await db.application.updateMany({ where: { id: applicationId, status: move.from }, data: { status: move.to } });

  if (moved.count === 1) {
    await db.applicationStatusHistory.create({
      data: { applicationId, fromStatus: move.from, toStatus: move.to, note: move.note },
    });
  }
}
