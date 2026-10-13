import { prisma } from "./prisma.js";

type Args = any;
type Result = any;

export type Delegate = {
  findUnique(args?: Args): Promise<Result>;
  findFirst(args?: Args): Promise<Result>;
  findMany(args?: Args): Promise<Result>;
  count(args?: Args): Promise<number>;
  create(args: Args): Promise<Result>;
  createMany(args: Args): Promise<{ count: number }>;
  update(args: Args): Promise<Result>;
  updateMany(args: Args): Promise<{ count: number }>;
  upsert(args: Args): Promise<Result>;
  delete(args: Args): Promise<Result>;
  deleteMany(args?: Args): Promise<{ count: number }>;
};

export type RecruitmentClient = {
  user: Delegate;
  role: Delegate;
  userRole: Delegate;
  college: Delegate;
  drive: Delegate;
  driveTemplate: Delegate;
  driveCoordinator: Delegate;
  driveCollege: Delegate;
  application: Delegate;
  applicationCounter: Delegate;
  applicationStatusHistory: Delegate;
  candidate: Delegate;
  candidateCredential: Delegate;
  candidateSession: Delegate;
  testTemplate: Delegate;
  testTemplateSection: Delegate;
  question: Delegate;
  questionOption: Delegate;
  testAttempt: Delegate;
  attemptQuestion: Delegate;
  attemptAnswer: Delegate;
  integrityEvent: Delegate;
  userCollege: Delegate;
  interview: Delegate;
  auditLog: Delegate;
  $transaction<T>(run: (tx: RecruitmentClient) => Promise<T>): Promise<T>;
};

export function rdb(): RecruitmentClient {
  return prisma as unknown as RecruitmentClient;
}

export function recruitmentClientReady(): boolean {
  return Boolean((prisma as unknown as Record<string, unknown>)["testAttempt"]);
}

export function asAuditDb(tx: RecruitmentClient): never {
  return tx as never;
}
