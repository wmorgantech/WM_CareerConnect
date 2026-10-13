

import { randomUUID } from "node:crypto";

type Row = Record<string, any>;

export type TableSpec = {
  pk: string[];
  uniques?: string[][];
  defaults?: () => Row;
};

export const SPECS: Record<string, TableSpec> = {
  candidate: { pk: ["id"], defaults: () => ({ phone: null, collegeId: null, resumeUrl: null, isActive: true, deletedAt: null, mobile: null, city: null, qualification: null, department: null, passingYear: null, experience: null, yearsOfExperience: null, consentAt: null, emailVerifiedAt: null, createdAt: new Date(), updatedAt: new Date() }) },
  application: { pk: ["id"], uniques: [["applicationNo"], ["driveId", "email"], ["driveId", "mobile"]], defaults: () => ({ status: "REGISTERED", offerReleased: false, registeredByUserId: null, emailVerifiedAt: null, verifiedManuallyByUserId: null, createdAt: new Date(), updatedAt: new Date() }) },
  applicationCounter: { pk: ["year"], defaults: () => ({ lastValue: 0 }) },
  applicationStatusHistory: { pk: ["id"], defaults: () => ({ fromStatus: null, changedByUserId: null, note: null, createdAt: new Date() }) },
  candidateCredential: { pk: ["applicationId"], defaults: () => ({ mustChangePassword: true, issuedByUserId: null, issuedAt: new Date(), passwordChangedAt: null, failedAttempts: 0, lockedUntil: null, lastLoginAt: null }) },
  candidateSession: { pk: ["id"], uniques: [["tokenHash"]], defaults: () => ({ applicationId: null, revokedAt: null, createdAt: new Date() }) },
  testTemplate: { pk: ["id"], uniques: [["level", "name"]], defaults: () => ({ negativeMarking: 0, questionCount: 0, easyPct: 40, mediumPct: 40, hardPct: 20, isActive: true, createdAt: new Date(), updatedAt: new Date() }) },
  testTemplateSection: { pk: ["id"], uniques: [["templateId", "key"]], defaults: () => ({ questionCount: 0, marksPerQuestion: 1 }) },
  question: { pk: ["id"], defaults: () => ({ topic: null, type: "MCQ_SINGLE", codeSnippet: null, explanation: null, isActive: true, deletedAt: null, createdAt: new Date(), updatedAt: new Date() }) },
  questionOption: { pk: ["id"], uniques: [["questionId", "position"]], defaults: () => ({ isCorrect: false }) },
  testAttempt: { pk: ["id"], uniques: [["applicationId"]], defaults: () => ({ submittedAt: null, status: "IN_PROGRESS", score: null, maxScore: null, percentage: null, tabSwitchCount: 0, termsVersion: null, termsAcceptedAt: null, flaggedForReview: false, integrityEventCount: 0, createdAt: new Date(), updatedAt: new Date() }) },
  attemptQuestion: { pk: ["attemptId", "questionId"], uniques: [["attemptId", "position"]], defaults: () => ({ marks: 1, correctOptionId: null, questionText: null, codeSnippet: null, optionsSnapshot: null }) },
  attemptAnswer: { pk: ["attemptId", "questionId"], defaults: () => ({ selectedOptionId: null, markedForReview: false, answeredAt: null, seq: 0, updatedAt: new Date() }) },
  integrityEvent: { pk: ["id"], defaults: () => ({ clientAt: null, details: null, createdAt: new Date() }) },
  driveTemplate: { pk: ["driveId", "level"], defaults: () => ({ assignedAt: new Date() }) },
  driveCoordinator: { pk: ["driveId", "userId"], defaults: () => ({ assignedAt: new Date() }) },
  driveCollege: { pk: ["driveId", "collegeId"] },
  userCollege: { pk: ["userId", "collegeId"], defaults: () => ({ createdAt: new Date() }) },
};

function same(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof Date || b instanceof Date) return false;
  return a === b;
}

function order(a: any, b: any): number {
  const x = a instanceof Date ? a.getTime() : a;
  const y = b instanceof Date ? b.getTime() : b;

  return x < y ? -1 : x > y ? 1 : 0;
}

function cond(value: any, c: any): boolean {
  if (c === null) return value === null || value === undefined;
  if (c instanceof Date || typeof c !== "object") return same(value, c);

  for (const [op, arg] of Object.entries(c)) {
    switch (op) {
      case "equals": if (!same(value, arg)) return false; break;
      case "in": if (!(arg as any[]).some((x) => same(value, x))) return false; break;
      case "notIn": if ((arg as any[]).some((x) => same(value, x))) return false; break;
      case "not":
        if (arg === null) { if (value === null || value === undefined) return false; }
        else if (typeof arg === "object" && !(arg instanceof Date)) { if (cond(value, arg)) return false; }
        else if (same(value, arg)) return false;
        break;
      case "gt": if (!(value !== null && value !== undefined && order(value, arg) > 0)) return false; break;
      case "gte": if (!(value !== null && value !== undefined && order(value, arg) >= 0)) return false; break;
      case "lt": if (!(value !== null && value !== undefined && order(value, arg) < 0)) return false; break;
      case "lte": if (!(value !== null && value !== undefined && order(value, arg) <= 0)) return false; break;
      case "contains": if (typeof value !== "string" || !value.toLowerCase().includes(String(arg).toLowerCase())) return false; break;
      case "startsWith": if (typeof value !== "string" || !value.toLowerCase().startsWith(String(arg).toLowerCase())) return false; break;
      case "mode": break;
      default: throw new Error(`fake: unsupported filter operator ${op}`);
    }
  }

  return true;
}

export function rowMatches(row: Row, where: Row = {}): boolean {
  for (const [key, expected] of Object.entries(where)) {
    if (expected === undefined) continue;
    if (key === "AND") { if (!(expected as Row[]).every((w) => rowMatches(row, w))) return false; continue; }
    if (key === "OR") { if (!(expected as Row[]).some((w) => rowMatches(row, w))) return false; continue; }
    if (key === "NOT") { if (rowMatches(row, expected)) return false; continue; }

if (!(key in row) && expected && typeof expected === "object" && !(expected instanceof Date) && key.includes("_")) {
      for (const [k, v] of Object.entries(expected)) if (!same(row[k], v)) return false;
      continue;
    }

    if (!cond(row[key], expected)) return false;
  }

  return true;
}

function duplicate(table: string, fields: string[]): Error {
  return Object.assign(new Error(`Unique constraint failed on ${table}(${fields.join(",")})`), { code: "P2002" });
}

export function makeTable(table: string, rowsOf: () => Row[], write: () => void) {
  const spec = SPECS[table]!;
  const keys = [spec.pk, ...(spec.uniques ?? [])];

  const clone = (row: Row | undefined) => (row ? { ...row } : null);
  const find = (where: Row) => rowsOf().find((r) => rowMatches(r, where));

  function checkUnique(candidate: Row, ignore?: Row) {
    for (const fields of keys) {
      if (fields.every((f) => candidate[f] === undefined || candidate[f] === null)) continue;
      const clash = rowsOf().find((r) => r !== ignore && fields.every((f) => same(r[f], candidate[f])));

      if (clash) throw duplicate(table, fields);
    }
  }

  function apply(row: Row, data: Row) {
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      if (v && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v) && "increment" in v) row[k] = (row[k] ?? 0) + v.increment;
      else row[k] = v;
    }
    if ("updatedAt" in row && !("updatedAt" in data)) row.updatedAt = new Date();
  }

  function sorted(rows: Row[], orderBy: any) {
    const specs = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []).flatMap((o: Row) => Object.entries(o));

    return specs.length === 0 ? rows : [...rows].sort((a, b) => {
      for (const [field, dir] of specs) {
        const c = order(a[field as string], b[field as string]);

        if (c !== 0) return dir === "desc" ? -c : c;
      }
      return 0;
    });
  }

  return {
    async findUnique({ where }: Row) { return clone(find(where)); },
    async findFirst({ where, orderBy }: Row = {}) { return clone(sorted(rowsOf().filter((r) => rowMatches(r, where ?? {})), orderBy)[0]); },
    async findMany({ where, orderBy, skip, take }: Row = {}) {
      let rows = sorted(rowsOf().filter((r) => rowMatches(r, where ?? {})), orderBy);

      if (skip) rows = rows.slice(skip);
      if (take !== undefined) rows = rows.slice(0, take);

      return rows.map((r) => ({ ...r }));
    },
    async count({ where }: Row = {}) { return rowsOf().filter((r) => rowMatches(r, where ?? {})).length; },
    async create({ data }: Row) {
      write();
      const row: Row = { ...(spec.defaults?.() ?? {}), ...data };

      if (spec.pk.length === 1 && spec.pk[0] === "id" && !row.id) row.id = randomUUID();
      checkUnique(row);
      rowsOf().push(row);

      return { ...row };
    },
    async createMany({ data, skipDuplicates }: Row) {
      write();
      let count = 0;

      for (const item of data as Row[]) {
        const row: Row = { ...(spec.defaults?.() ?? {}), ...item };

        if (spec.pk.length === 1 && spec.pk[0] === "id" && !row.id) row.id = randomUUID();

        try { checkUnique(row); } catch (e) { if (skipDuplicates) continue; throw e; }
        rowsOf().push(row);
        count += 1;
      }

      return { count };
    },
    async update({ where, data }: Row) {
      write();
      const row = find(where);

      if (!row) throw Object.assign(new Error("Record to update not found"), { code: "P2025" });
      const next = { ...row }; apply(next, data); checkUnique(next, row);
      apply(row, data);

      return { ...row };
    },
    async updateMany({ where, data }: Row) {
      write();
      let count = 0;

      for (const row of rowsOf()) if (rowMatches(row, where ?? {})) { apply(row, data); count += 1; }

      return { count };
    },
    async upsert({ where, create, update }: Row) {
      write();
      const row = find(where);

      if (row) { apply(row, update); return { ...row }; }
      const created: Row = { ...(spec.defaults?.() ?? {}), ...create };

      if (spec.pk.length === 1 && spec.pk[0] === "id" && !created.id) created.id = randomUUID();
      checkUnique(created);
      rowsOf().push(created);

      return { ...created };
    },
    async delete({ where }: Row) {
      write();
      const row = find(where);

      if (!row) throw Object.assign(new Error("Record to delete not found"), { code: "P2025" });
      rowsOf().splice(rowsOf().indexOf(row), 1);

      return { ...row };
    },
    async deleteMany({ where }: Row = {}) {
      write();
      const doomed = rowsOf().filter((r) => rowMatches(r, where ?? {}));

      for (const row of doomed) rowsOf().splice(rowsOf().indexOf(row), 1);

      return { count: doomed.length };
    },
  };
}
