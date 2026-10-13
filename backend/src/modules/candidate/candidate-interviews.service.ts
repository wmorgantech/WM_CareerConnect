import { rdb } from "../../lib/recruitment-db.js";

type Row = Record<string, any>;

export async function candidateInterviews(ctx: { candidateId: string }) {
  const db = rdb();
  const interviews: Row[] = await db.interview.findMany({ where: { candidateId: ctx.candidateId } });

  if (interviews.length === 0) return [];

  const interviewers: Row[] = await db.user.findMany({
    where: { id: { in: [...new Set(interviews.map((i) => i.interviewerId as string))] } },
  });

  return interviews
    .map((i) => ({
      id: i.id as string,
      scheduledAt: i.scheduledAt as Date,
      durationMinutes: i.durationMinutes as number,
      meetingLink: (i.meetingLink ?? null) as string | null,
      status: i.status as string,
      interviewer: (interviewers.find((u) => u.id === i.interviewerId)?.name ?? null) as string | null,
    }))
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}
