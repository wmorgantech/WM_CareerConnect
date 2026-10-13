

import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { installFakePrisma } from "./fakes.js";
import { makeTable, SPECS } from "./recruitment-tables.js";

type Row = Record<string, any>;

export const SEEDED_ROLE_PERMISSIONS: Record<string, string[]> = {
  HR_ADMIN: ["colleges.manage", "drives.manage", "candidates.manage", "candidates.viewAll", "candidates.register", "testStatus.monitor", "results.view", "candidates.shortlist", "candidates.reject", "interviews.schedule", "interviews.feedback", "reports.view", "reports.export"],
  CAMPUS_COORDINATOR: ["candidates.viewAll", "candidates.register", "testStatus.monitor"],
  INTERVIEWER: ["candidates.viewAll", "results.view", "interviews.feedback"],
  CANDIDATE: ["candidates.register", "results.view"],
  HOD: ["results.view"],
  STAFF: ["results.view"],
};

export const ALL_PERMISSIONS = [
  "users.manage", "roles.manage", "settings.manage", "colleges.manage", "drives.manage", "questions.manage", "tests.manage",
  "candidates.manage", "candidates.viewAll", "candidates.register", "testStatus.monitor", "results.view", "candidates.shortlist",
  "candidates.reject", "interviews.schedule", "interviews.feedback", "reports.view", "reports.export", "audit.view",
];

export const ROLE_NAMES = ["SUPER_ADMIN", "HR_ADMIN", "CAMPUS_COORDINATOR", "INTERVIEWER", "CANDIDATE", "HOD", "STAFF"] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

type State = {
  roles: Row[];
  permissions: Row[];
  rolePermissions: Row[];
  users: Map<string, Row>;
  userRoles: Row[];
  sessions: Map<string, Row>;
  interviews: Map<string, Row>;
  drives: Map<string, Row>;
  colleges: Map<string, Row>;
  auditLog: Row[];
  setting: Row | null;
  tables: Record<string, Row[]>;
};

function matches(row: Row, where: Row = {}): boolean {
  for (const [key, expected] of Object.entries(where)) {
    if (key === "NOT") {
      if (matches(row, expected)) return false;
    } else if (key === "userRoles") {
      const wanted = expected?.some?.role?.name;

      if (typeof wanted !== "string") throw new Error(`fake: unsupported userRoles filter ${JSON.stringify(expected)}`);
      if (!row.userRoles.some((ur: Row) => ur.role.name === wanted)) return false;
    } else if (key === "OR" || key === "AND") {
      throw new Error(`fake: unsupported filter ${key}`);
    } else if (expected instanceof Date) {
      if (!(row[key] instanceof Date) || row[key].getTime() !== expected.getTime()) return false;
    } else if (expected !== null && typeof expected === "object") {
      if ("in" in expected) {
        if (!expected.in.includes(row[key])) return false;
      } else if ("gt" in expected) {
        if (!(row[key] > expected.gt)) return false;
      } else if ("not" in expected) {
        if (row[key] === expected.not) return false;
      } else {
        throw new Error(`fake: unsupported filter on ${key}: ${JSON.stringify(expected)}`);
      }
    } else if (row[key] !== expected) {
      return false;
    }
  }

  return true;
}

function strict<T extends object>(name: string, impl: T): T {
  return new Proxy(impl, {
    get(target, prop, receiver) {
      if (prop in target || typeof prop === "symbol" || prop === "then") return Reflect.get(target, prop, receiver);

      throw new Error(`${name}.${String(prop)} is not implemented in the in-memory fake`);
    },
  });
}

export function createMemoryDb() {
  const state: State = {
    roles: [], permissions: [], rolePermissions: [], users: new Map(), userRoles: [], sessions: new Map(),
    interviews: new Map(), drives: new Map(), colleges: new Map(), auditLog: [], setting: null,
    tables: Object.fromEntries(Object.keys(SPECS).map((name) => [name, [] as Row[]])),
  };
  const counters = { writes: 0 };
  const write = () => { counters.writes += 1; };

  for (const name of ALL_PERMISSIONS) state.permissions.push({ id: `perm-${name}`, name });

  for (const name of ROLE_NAMES) {
    const role = { id: randomUUID(), name, description: `${name} role` };
    const names = name === "SUPER_ADMIN" ? ALL_PERMISSIONS : SEEDED_ROLE_PERMISSIONS[name] ?? [];

    state.roles.push(role);
    for (const permissionName of names) state.rolePermissions.push({ roleId: role.id, permissionId: `perm-${permissionName}` });
  }

  const roleByName = (name: string) => state.roles.find((r) => r.name === name)!;
  const roleView = (roleId: string) => {
    const role = state.roles.find((r) => r.id === roleId)!;

    return { ...role, permissions: state.rolePermissions.filter((rp) => rp.roleId === roleId).map((rp) => ({ ...rp, permission: state.permissions.find((p) => p.id === rp.permissionId)! })) };
  };
  const userView = (user: Row): Row => ({ ...user, userRoles: state.userRoles.filter((ur) => ur.userId === user.id).map((ur) => ({ ...ur, role: roleView(ur.roleId) })) });
  const findUser = (where: Row) => [...state.users.values()].map(userView).find((u) => matches(u, where)) ?? null;
  const findSession = (where: Row) => [...state.sessions.values()].find((s) => matches(s, where)) ?? null;

  const withInterview = (row: Row) => ({ ...row });

  const prismaUser = strict("user", {
    findUnique: async ({ where }: Row) => findUser(where),
    findFirst: async ({ where }: Row) => findUser(where),
    findMany: async ({ where }: Row = {}) => [...state.users.values()].map(userView).filter((u) => matches(u, where ?? {})),
    count: async ({ where }: Row = {}) => [...state.users.values()].map(userView).filter((u) => matches(u, where ?? {})).length,
    create: async ({ data }: Row) => {
      write();
      const user = { id: randomUUID(), email: data.email, name: data.name, passwordHash: data.passwordHash, status: data.status ?? "ACTIVE", createdAt: new Date(), updatedAt: new Date() };

      state.users.set(user.id, user);
      for (const { roleId } of data.userRoles?.create ?? []) state.userRoles.push({ userId: user.id, roleId });

      return userView(user);
    },
    update: async ({ where, data }: Row) => {
      write();
      const user = state.users.get(where.id);

      if (!user) throw new Error("fake: record to update not found");
      for (const key of ["email", "name", "passwordHash", "status"]) if (data[key] !== undefined) user[key] = data[key];
      for (const { roleId } of data.userRoles?.create ?? []) state.userRoles.push({ userId: user.id, roleId });
      user.updatedAt = new Date();

      return userView(user);
    },
    delete: async ({ where }: Row) => {
      write();
      if (!state.users.delete(where.id)) throw new Error("fake: record to delete not found");
      state.userRoles = state.userRoles.filter((ur) => ur.userId !== where.id);
      for (const [id, s] of state.sessions) if (s.userId === where.id) state.sessions.delete(id);
    },
  });

  const prismaRole = strict("role", {
    findMany: async ({ where }: Row = {}) => {
      const rows = state.roles.filter((r) => matches(r, where ?? {}));

      return rows.map((r) => ({ id: r.id, name: r.name, description: r.description }));
    },
  });

  const prismaUserRole = strict("userRole", {
    deleteMany: async ({ where }: Row) => {
      write();
      const before = state.userRoles.length;

      state.userRoles = state.userRoles.filter((ur) => !matches(ur, where));

      return { count: before - state.userRoles.length };
    },
  });

  const prismaRefreshToken = strict("refreshToken", {
    create: async ({ data }: Row) => {
      write();
      const row = { id: randomUUID(), tokenHash: data.tokenHash, userId: data.userId, expiresAt: data.expiresAt, revokedAt: null, createdAt: new Date() };

      state.sessions.set(row.id, row);

      return row;
    },
    findUnique: async ({ where, include }: Row) => {
      const row = findSession(where);

      if (!row) return null;

      return include?.user ? { ...row, user: findUser({ id: row.userId }) } : { ...row };
    },
    updateMany: async ({ where, data }: Row) => {
      write();
      let count = 0;

      for (const row of state.sessions.values()) {
        if (matches(row, where)) {
          Object.assign(row, data);
          count += 1;
        }
      }

      return { count };
    },
  });

  const rowMatch = (map: Map<string, Row>, where: Row) => [...map.values()].find((r) => matches(r, where)) ?? null;

  const prismaInterview = strict("interview", {
    findUnique: async ({ where }: Row) => { const r = rowMatch(state.interviews, where); return r ? withInterview(r) : null; },
    findFirst: async ({ where }: Row) => { const r = rowMatch(state.interviews, where); return r ? withInterview(r) : null; },
    findUniqueOrThrow: async ({ where }: Row) => { const r = rowMatch(state.interviews, where); if (!r) throw new Error("fake: not found"); return withInterview(r); },
    findMany: async ({ where }: Row = {}) => [...state.interviews.values()].filter((r) => matches(r, where ?? {})).map(withInterview),
    count: async ({ where }: Row = {}) => [...state.interviews.values()].filter((r) => matches(r, where ?? {})).length,
    create: async ({ data }: Row) => {
      write();
      const candidate = (state.tables.candidate as Row[]).find((c) => c.id === data.candidateId);
      const r = { id: randomUUID(), meetingLink: null, notes: null, status: "SCHEDULED", feedback: null, score: null, feedbackSubmittedAt: null, feedbackLockedAt: null, createdAt: new Date(), updatedAt: new Date(), ...data, candidate: candidate ? { id: candidate.id, name: candidate.name, email: candidate.email } : null };

      state.interviews.set(r.id, r);

      return withInterview(r);
    },
    update: async ({ where, data }: Row) => { write(); const r = rowMatch(state.interviews, where); if (!r) throw new Error("fake: not found"); Object.assign(r, data, { updatedAt: new Date() }); return withInterview(r); },
    updateMany: async ({ where, data }: Row) => { write(); let count = 0; for (const r of state.interviews.values()) if (matches(r, where)) { Object.assign(r, data, { updatedAt: new Date() }); count += 1; } return { count }; },
  } as Row);

  const prismaDrive = strict("drive", {
    findFirst: async ({ where }: Row) => { const r = rowMatch(state.drives, where); return r ? { ...r, college: state.colleges.get(r.collegeId) } : null; },
    findUnique: async ({ where }: Row) => { const r = rowMatch(state.drives, where); return r ? { ...r } : null; },
    findMany: async ({ where }: Row = {}) => [...state.drives.values()].filter((r) => matches(r, where ?? {})).map((r) => ({ ...r, college: state.colleges.get(r.collegeId) })),
    count: async () => state.drives.size,
    create: async ({ data }: Row) => { write(); const r = { id: randomUUID(), description: null, startDate: null, endDate: null, deletedAt: null, createdAt: new Date(), updatedAt: new Date(), ...data }; state.drives.set(r.id, r); return { ...r, college: state.colleges.get(r.collegeId) }; },
    update: async ({ where, data }: Row) => { write(); const r = rowMatch(state.drives, where); if (!r) throw new Error("fake: not found"); Object.assign(r, data); return { ...r, college: state.colleges.get(r.collegeId) }; },
  });

  const prismaCollege = strict("college", {
    findFirst: async ({ where }: Row) => rowMatch(state.colleges, where),
    findUnique: async ({ where }: Row) => rowMatch(state.colleges, where),
    findMany: async ({ where }: Row = {}) => [...state.colleges.values()].filter((c) => matches(c, where ?? {})),
    count: async () => state.colleges.size,
  });

  const prismaAudit = strict("auditLog", {
    create: async ({ data }: Row) => { write(); const r = { id: randomUUID(), createdAt: new Date(), ...data }; state.auditLog.push(r); return r; },
    findMany: async () => [...state.auditLog].reverse(),
    count: async () => state.auditLog.length,
  });

  const prismaSetting = strict("setting", {
    findFirst: async () => state.setting,
  });

const queryRaw = async (strings: TemplateStringsArray) => {
    const text = strings.join("?");

    if (/FROM "Role"/.test(text)) return state.roles.filter((r) => r.name === "SUPER_ADMIN").map((r) => ({ id: r.id }));

    if (/JOIN "UserRole"/.test(text)) {
      return [...state.users.values()].map(userView).filter((u) => u.status === "ACTIVE" && u.userRoles.some((ur: Row) => ur.role.name === "SUPER_ADMIN")).map((u) => ({ id: u.id }));
    }

    throw new Error(`fake: unsupported raw query: ${text.slice(0, 60)}`);
  };

const copyRows = (rows: Row[]) => rows.map((r) => ({ ...r }));
  const copyMap = (map: Map<string, Row>) => new Map([...map].map(([k, v]) => [k, { ...v }]));
  const cloneState = (from: State): State => ({
    roles: copyRows(from.roles),
    permissions: copyRows(from.permissions),
    rolePermissions: copyRows(from.rolePermissions),
    users: copyMap(from.users),
    userRoles: copyRows(from.userRoles),
    sessions: copyMap(from.sessions),
    interviews: copyMap(from.interviews),
    drives: copyMap(from.drives),
    colleges: copyMap(from.colleges),
    auditLog: copyRows(from.auditLog),
    setting: from.setting ? { ...from.setting } : null,
    tables: Object.fromEntries(Object.entries(from.tables).map(([name, rows]) => [name, copyRows(rows)])),
  });
  const snapshot = (): State => cloneState(state);
  const restore = (saved: State) => { Object.assign(state, cloneState(saved)); };

  const client: Row = {
    user: prismaUser, role: prismaRole, userRole: prismaUserRole, refreshToken: prismaRefreshToken,
    interview: prismaInterview, drive: prismaDrive, college: prismaCollege,
    auditLog: prismaAudit, setting: prismaSetting, $queryRaw: queryRaw,
  };

  for (const name of Object.keys(SPECS)) {
    client[name] = strict(name, makeTable(name, () => state.tables[name] as Row[], write));
  }

client.$transaction = async (arg: unknown) => {
    if (Array.isArray(arg)) return Promise.all(arg);

    const saved = snapshot();

    try {
      return await (arg as (tx: Row) => Promise<unknown>)(client);
    } catch (error) {
      restore(saved);
      throw error;
    }
  };

function addUser(role: RoleName | RoleName[], over: Row = {}) {
    const roles = Array.isArray(role) ? role : [role];
    const user = { id: randomUUID(), email: `${roles[0]!.toLowerCase()}-${state.users.size}@example.test`, name: `${roles[0]} user`, passwordHash: "hash-not-used", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date(), ...over };

    state.users.set(user.id, user);
    for (const r of roles) state.userRoles.push({ userId: user.id, roleId: roleByName(r).id });

    return user;
  }

  function addSession(userId: string, over: Row = {}) {
    const row = { id: randomUUID(), tokenHash: randomUUID(), userId, expiresAt: new Date(Date.now() + 7 * 86400000), revokedAt: null, createdAt: new Date(), ...over };

    state.sessions.set(row.id, row);

    return row;
  }

function accessTokenFor(userId: string, session = addSession(userId)) {
    return jwt.sign({ sub: userId, sid: session.id, type: "access" }, process.env.JWT_ACCESS_SECRET as string, { expiresIn: "15m" });
  }

  function addCollege(over: Row = {}) {
    const college = { id: randomUUID(), name: "Demo College", city: "Coimbatore", isActive: true, deletedAt: null, ...over };

    state.colleges.set(college.id, college);

    return college;
  }

  function addDrive(over: Row = {}) {
    const college = (over.collegeId && state.colleges.get(over.collegeId)) || addCollege();
    const drive = { id: randomUUID(), title: "Drive", description: null, collegeId: college.id, status: "DRAFT", startDate: null, endDate: null, isActive: true, deletedAt: null, accessCode: null, levelAllowed: "BOTH", registrationOpen: false, testStartsAt: null, testEndsAt: null, createdAt: new Date(), updatedAt: new Date(), ...over };

    state.drives.set(drive.id, drive);

    return drive;
  }

  function addInterview(over: Row = {}) {
    const row = {
      id: randomUUID(), candidateId: "cand-1", interviewerId: "interviewer-id", scheduledAt: new Date(Date.now() + 86400000), durationMinutes: 60,
      meetingLink: null, notes: null, status: "SCHEDULED", feedback: null, score: null, feedbackSubmittedAt: null, feedbackLockedAt: null,
      createdAt: new Date(), updatedAt: new Date(), candidate: { id: "cand-1", name: "Asha", email: "asha@example.test" }, ...over,
    };

    state.interviews.set(row.id, row);

    return row;
  }

function insert(table: string, row: Row) {
    const spec = SPECS[table]!;
    const full: Row = { ...(spec.defaults?.() ?? {}), ...row };

    if (spec.pk.length === 1 && spec.pk[0] === "id" && !full.id) full.id = randomUUID();
    (state.tables[table] as Row[]).push(full);

    return full;
  }

function addQuestion(over: Row = {}, correct = 0) {
    const question = insert("question", { level: "BOTH", section: "oop", difficulty: "EASY", text: `Question ${state.tables.question!.length + 1}?`, ...over });
    const options = [0, 1, 2, 3].map((i) => insert("questionOption", { questionId: question.id, text: `Option ${i + 1} of ${question.id.slice(0, 4)}`, isCorrect: i === correct, position: i + 1 }));

    return { question, options };
  }

  function addQuestions(count: number, over: Row = {}) {
    return Array.from({ length: count }, (_, i) => addQuestion({ difficulty: i % 3 === 2 ? "MEDIUM" : "EASY", ...over }));
  }

  function addTemplate(over: Row = {}, sections: { key: string; count: number; marksPerQuestion: number }[] = [{ key: "oop", count: 2, marksPerQuestion: 1 }]) {
    const questionCount = sections.reduce((n, x) => n + x.count, 0);
    const totalMarks = sections.reduce((n, x) => n + x.count * x.marksPerQuestion, 0);
    const template = insert("testTemplate", { name: `Template ${state.tables.testTemplate!.length + 1}`, level: "UG", durationMinutes: over.level === "PG" ? 75 : 60, totalMarks, questionCount, easyPct: 60, mediumPct: 40, hardPct: 0, ...over });

    sections.forEach((x, i) => insert("testTemplateSection", { templateId: template.id, key: x.key, title: x.key.toUpperCase(), marks: x.count * x.marksPerQuestion, questionCount: x.count, marksPerQuestion: x.marksPerQuestion, position: i + 1 }));

    return template;
  }

  function addApplication(over: Row = {}, candidateOver: Row = {}) {
    const driveId = over.driveId ?? addDrive().id;
    const n = state.tables.application!.length + 1;
    const candidate = insert("candidate", { name: `Student ${n}`, email: `student${n}@example.test`, collegeId: state.drives.get(driveId)?.collegeId ?? null, ...candidateOver });
    const application = insert("application", { applicationNo: `WMC-2026-${String(n).padStart(5, "0")}`, candidateId: candidate.id, driveId, level: "UG", email: candidate.email, mobile: `9${String(100000000 + n)}`, ...over });

    return { candidate, application };
  }

  const restorePrisma = installFakePrisma(client);

  return {
    client, state, counters, snapshot, restore: restorePrisma, addUser, addSession, accessTokenFor, addCollege, addDrive, addInterview,
    insert, addQuestion, addQuestions, addTemplate, addApplication,
    rows: (table: string) => state.tables[table] as Row[],
    roleId: (name: RoleName) => roleByName(name).id,
    activeSessions: (userId: string) => [...state.sessions.values()].filter((s) => s.userId === userId && s.revokedAt === null),
  };
}

export type MemoryDb = ReturnType<typeof createMemoryDb>;
