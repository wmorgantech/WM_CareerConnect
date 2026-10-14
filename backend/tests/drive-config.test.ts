

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createMemoryDb, type MemoryDb } from "./helpers/memory-db.js";
import { api, staff } from "./helpers/http.js";

let db: MemoryDb | null = null;

afterEach(() => {
  db?.restore();
  db = null;
});

function world(opts: { enoughQuestions?: boolean } = {}) {
  const d = (db = createMemoryDb());
  const hr = staff(d, "HR_ADMIN");
  const admin = staff(d, "SUPER_ADMIN");
  const drive = d.addDrive({ status: "DRAFT" });
  const ugTemplate = d.addTemplate({ level: "UG", name: "UG" }, [{ key: "oop", count: 2, marksPerQuestion: 1 }]);
  const pgTemplate = d.addTemplate({ level: "PG", name: "PG" }, [{ key: "oop", count: 2, marksPerQuestion: 1 }]);

  if (opts.enoughQuestions !== false) d.addQuestions(5, { section: "oop", level: "BOTH" });

  return { d, hr, admin, drive, ugTemplate, pgTemplate };
}

const url = (id: string, tail = "") => `/drives/${id}${tail}`;

describe("template slots", () => {
  it("assigns a template per level, refusing a wrong level, an inactive template and a level the drive does not allow", async () => {
    const w = world();
    const inactive = w.d.addTemplate({ level: "UG", name: "Old UG", isActive: false });

    await api(async (call) => {
      const t = w.hr.token;

      assert.equal((await call("PUT", url(w.drive.id, "/templates/UG"), { token: t, body: { templateId: w.pgTemplate.id } })).json.error.code, "TEMPLATE_LEVEL_MISMATCH");
      assert.equal((await call("PUT", url(w.drive.id, "/templates/UG"), { token: t, body: { templateId: inactive.id } })).json.error.code, "TEMPLATE_INACTIVE");
      assert.equal((await call("PUT", url(w.drive.id, "/templates/UG"), { token: t, body: { templateId: "2f2c0c8c-0000-4000-8000-000000000000" } })).status, 404);
      assert.equal((await call("PUT", url(w.drive.id, "/templates/UG"), { token: t, body: { templateId: w.ugTemplate.id } })).status, 200);
      assert.equal((await call("PUT", url(w.drive.id, "/templates/XX"), { token: t, body: { templateId: w.ugTemplate.id } })).status, 400);

assert.equal((await call("PATCH", url(w.drive.id, "/config"), { token: t, body: { levelAllowed: "PG" } })).json.error.code, "LEVEL_IN_USE", "UG already has a template");
      assert.equal((await call("DELETE", url(w.drive.id, "/templates/UG"), { token: t })).status, 200);
      assert.equal((await call("PATCH", url(w.drive.id, "/config"), { token: t, body: { levelAllowed: "UG" } })).status, 200);
      assert.equal((await call("PUT", url(w.drive.id, "/templates/PG"), { token: t, body: { templateId: w.pgTemplate.id } })).json.error.code, "LEVEL_NOT_ALLOWED");
    });
    assert.equal(w.d.rows("driveTemplate").length, 0);
  });

  it("never falls back to another level: readiness names every level that has no usable template", async () => {
    const w = world();

    await api(async (call) => {
      const t = w.hr.token;

      await call("PUT", url(w.drive.id, "/templates/UG"), { token: t, body: { templateId: w.ugTemplate.id } });

      const config = (await call("GET", url(w.drive.id, "/config"), { token: t })).json.data;

      assert.equal(config.readiness.ready, false);
      assert.deepEqual(config.readiness.issues.map((i: any) => [i.level, i.code]), [["PG", "TEMPLATE_NOT_CONFIGURED"]]);

      await call("PUT", url(w.drive.id, "/templates/PG"), { token: t, body: { templateId: w.pgTemplate.id } });
      assert.equal((await call("GET", url(w.drive.id, "/config"), { token: t })).json.data.readiness.ready, true);

      w.d.rows("testTemplate").find((x) => x.id === w.pgTemplate.id)!.isActive = false;
      assert.deepEqual((await call("GET", url(w.drive.id, "/config"), { token: t })).json.data.readiness.issues.map((i: any) => i.code), ["TEMPLATE_INACTIVE"]);
    });
  });

  it("a template whose duration is not the fixed one for its level blocks readiness (UG 60, PG 75)", async () => {
    const w = world();
    const legacyUg = w.d.addTemplate({ level: "UG", name: "UG legacy", durationMinutes: 70 }, [{ key: "oop", count: 2, marksPerQuestion: 1 }]);
    const wrongPg = w.d.addTemplate({ level: "PG", name: "PG short", durationMinutes: 60 }, [{ key: "oop", count: 2, marksPerQuestion: 1 }]);

    await api(async (call) => {
      const t = w.hr.token;

      await call("PUT", url(w.drive.id, "/templates/UG"), { token: t, body: { templateId: legacyUg.id } });
      await call("PUT", url(w.drive.id, "/templates/PG"), { token: t, body: { templateId: wrongPg.id } });

      const issues = (await call("GET", url(w.drive.id, "/config"), { token: t })).json.data.readiness.issues;

      assert.deepEqual(issues.map((i: any) => [i.level, i.code]), [["UG", "TEMPLATE_DURATION_INVALID"], ["PG", "TEMPLATE_DURATION_INVALID"]]);
      assert.match(issues[0].message, /70 minutes.*fixed at 60/);
      assert.match(issues[1].message, /60 minutes.*fixed at 75/);

      await call("PUT", url(w.drive.id, "/templates/UG"), { token: t, body: { templateId: w.ugTemplate.id } });
      await call("PUT", url(w.drive.id, "/templates/PG"), { token: t, body: { templateId: w.pgTemplate.id } });
      assert.equal((await call("GET", url(w.drive.id, "/config"), { token: t })).json.data.readiness.ready, true, "correct durations are ready");
    });
  });

  it("an insufficient question bank blocks readiness and says by how much", async () => {
    const w = world({ enoughQuestions: false });

    w.d.addQuestion({ section: "oop", level: "BOTH" });

    await api(async (call) => {
      await call("PUT", url(w.drive.id, "/templates/UG"), { token: w.hr.token, body: { templateId: w.ugTemplate.id } });
      await call("PATCH", url(w.drive.id, "/config"), { token: w.hr.token, body: { levelAllowed: "UG" } });

      const issues = (await call("GET", url(w.drive.id, "/config"), { token: w.hr.token })).json.data.readiness.issues;

      assert.equal(issues[0].code, "QUESTION_BANK_INSUFFICIENT");
      assert.match(issues[0].message, /needs 2 questions, the bank has 1/);
    });
  });

  it("templates are locked once students have started that level", async () => {
    const w = world();
    const { application } = w.d.addApplication({ driveId: w.drive.id, level: "UG" });

    await api(async (call) => {
      await call("PUT", url(w.drive.id, "/templates/UG"), { token: w.hr.token, body: { templateId: w.ugTemplate.id } });
      w.d.insert("testAttempt", { applicationId: application.id, templateId: w.ugTemplate.id, startedAt: new Date(), deadline: new Date(Date.now() + 1000) });

      assert.equal((await call("DELETE", url(w.drive.id, "/templates/UG"), { token: w.hr.token })).json.error.code, "TEMPLATE_LOCKED");
      assert.equal((await call("PUT", url(w.drive.id, "/templates/UG"), { token: w.hr.token, body: { templateId: w.ugTemplate.id } })).json.error.code, "TEMPLATE_LOCKED");
    });
    assert.equal(w.d.rows("driveTemplate").length, 1);
  });

  it("HR can pick from active templates without being able to manage them", async () => {
    const w = world();

    await api(async (call) => {
      assert.equal((await call("GET", "/test-templates", { token: w.hr.token })).status, 403);

      const options = await call("GET", "/drives/template-options", { token: w.hr.token });

      assert.equal(options.status, 200);
      assert.deepEqual(options.json.data.map((o: any) => o.level).sort(), ["PG", "UG"]);
      assert.equal(JSON.stringify(options.json).includes("sections"), false);
      assert.equal((await call("GET", "/drives/template-options", { token: staff(w.d, "INTERVIEWER").token })).status, 403);
    });
  });
});

describe("publishing and registration", () => {
  it("a drive cannot be created published, nor published before its templates are ready", async () => {
    const w = world();
    const college = w.d.addCollege();

    await api(async (call) => {
      const t = w.hr.token;
      const created = await call("POST", "/drives", { token: t, body: { title: "Autumn drive", collegeId: college.id, status: "PUBLISHED" } });

      assert.equal(created.status, 409);
      assert.equal(created.json.error.code, "DRIVE_NOT_READY");

      const early = await call("PATCH", url(w.drive.id), {
        token: t,
        body: { status: "PUBLISHED", title: "Unsaved while blocked" },
      });

      assert.equal(early.status, 409);
      assert.equal(early.json.error.code, "DRIVE_NOT_READY");
      assert.deepEqual(
        early.json.error.details.issues.map((issue: any) => [issue.level, issue.code]),
        [
          ["UG", "TEMPLATE_NOT_CONFIGURED"],
          ["PG", "TEMPLATE_NOT_CONFIGURED"],
        ],
      );
      assert.equal(w.d.state.drives.get(w.drive.id)!.status, "DRAFT");
      assert.notEqual(w.d.state.drives.get(w.drive.id)!.title, "Unsaved while blocked");

      const savedDraft = await call("PATCH", url(w.drive.id), {
        token: t,
        body: { status: "DRAFT", title: "Saved as draft" },
      });

      assert.equal(savedDraft.status, 200);
      assert.equal(w.d.state.drives.get(w.drive.id)!.status, "DRAFT");
      assert.equal(w.d.state.drives.get(w.drive.id)!.title, "Saved as draft");

      await call("PUT", url(w.drive.id, "/templates/UG"), { token: t, body: { templateId: w.ugTemplate.id } });
      await call("PUT", url(w.drive.id, "/templates/PG"), { token: t, body: { templateId: w.pgTemplate.id } });

      assert.equal((await call("PATCH", url(w.drive.id), { token: t, body: { status: "PUBLISHED" } })).status, 200);
      assert.equal(w.d.state.drives.get(w.drive.id)!.status, "PUBLISHED");
    });
  });

  it("registration opens only for a published, ready drive, and the test window must be ordered", async () => {
    const w = world();

    await api(async (call) => {
      const t = w.hr.token;
      const open = () => call("PATCH", url(w.drive.id, "/config"), { token: t, body: { registrationOpen: true } });

      assert.equal((await open()).json.error.code, "DRIVE_NOT_READY", "draft drive");

      await call("PUT", url(w.drive.id, "/templates/UG"), { token: t, body: { templateId: w.ugTemplate.id } });
      await call("PUT", url(w.drive.id, "/templates/PG"), { token: t, body: { templateId: w.pgTemplate.id } });
      w.d.state.drives.get(w.drive.id)!.status = "PUBLISHED";

      const opened = await open();

      assert.equal(opened.status, 200);
      assert.equal(opened.json.data.registrationOpen, true);

      assert.equal((await call("PATCH", url(w.drive.id, "/config"), { token: t, body: { testStartsAt: "2026-11-10T10:00:00.000Z", testEndsAt: "2026-11-10T09:00:00.000Z" } })).status, 400);
      assert.equal((await call("PATCH", url(w.drive.id, "/config"), { token: t, body: { testStartsAt: "2026-11-10T09:00:00.000Z", testEndsAt: "2026-11-10T12:00:00.000Z" } })).status, 200);
      assert.equal((await call("PATCH", url(w.drive.id, "/config"), { token: t, body: { registrationOpen: false } })).json.data.registrationOpen, false);
      assert.equal((await call("PATCH", url(w.drive.id, "/config"), { token: t, body: {} })).status, 400);
    });
  });

  it("the access code is generated on request in the agreed format", async () => {
    const w = world();

    await api(async (call) => {
      const first = (await call("PATCH", url(w.drive.id, "/config"), { token: w.hr.token, body: { regenerateAccessCode: true } })).json.data.accessCode;

      assert.match(first, /^[A-HJ-KM-NP-Z2-9]{6}$/);
    });
  });
});

describe("coordinators", () => {
  it("only active coordinators can be assigned; assignment is audited and reversible; coordinators cannot manage drives", async () => {
    const w = world();
    const coordinator = staff(w.d, "CAMPUS_COORDINATOR");
    const interviewer = staff(w.d, "INTERVIEWER");

    await api(async (call) => {
      const t = w.hr.token;

      assert.equal((await call("PUT", url(w.drive.id, "/coordinators"), { token: t, body: { userId: interviewer.user.id } })).json.error.code, "NOT_A_COORDINATOR");

      const ok = await call("PUT", url(w.drive.id, "/coordinators"), { token: t, body: { userId: coordinator.user.id } });

      assert.equal(ok.status, 200);
      assert.deepEqual(ok.json.data.coordinators.map((c: any) => c.userId), [coordinator.user.id]);
      assert.deepEqual((await call("GET", "/drives/coordinator-candidates", { token: t })).json.data.map((u: any) => u.id), [coordinator.user.id]);

      assert.equal((await call("GET", url(w.drive.id, "/config"), { token: coordinator.token })).status, 403);
      assert.equal((await call("PUT", url(w.drive.id, "/coordinators"), { token: coordinator.token, body: { userId: coordinator.user.id } })).status, 403);

      assert.equal((await call("DELETE", url(w.drive.id, `/coordinators/${coordinator.user.id}`), { token: t })).json.data.coordinators.length, 0);

      coordinator.user.status = "INACTIVE";
      w.d.state.users.get(coordinator.user.id)!.status = "INACTIVE";
      assert.equal((await call("PUT", url(w.drive.id, "/coordinators"), { token: t, body: { userId: coordinator.user.id } })).status, 400, "an inactive coordinator cannot be assigned");
    });
    assert.deepEqual(w.d.state.auditLog.map((a) => a.action).filter((a) => a.startsWith("DRIVE_COORDINATOR")), ["DRIVE_COORDINATOR_ASSIGNED", "DRIVE_COORDINATOR_REMOVED"]);
  });
});
