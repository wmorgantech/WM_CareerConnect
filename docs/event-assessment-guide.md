# Recruitment assessment: what was built, what is pending, how to run it

Status: **code complete and tested with in-memory fakes; NOT verified against PostgreSQL; the database is NOT migrated.**
Nothing below has been applied to `wm_careerconnect` or `wm_careerconnect_itest`.

## 1. What exists

| Area | Where | Notes |
|---|---|---|
| Question bank | `backend/src/modules/questions`, admin `pages/questions` | Super Admin only. Four distinct options, exactly one correct. A question used in an assessment is frozen. |
| Test templates | `backend/src/modules/test-templates`, admin `pages/templates` | UG 45 questions / 60 marks / exactly 60 minutes; PG 75 questions / exactly 75 minutes (PG total marks are set by the template author). The duration is fixed by level and enforced by the API, the Admin form and the drive readiness check. |
| Drive assessment setup | `backend/src/modules/drive-config`, admin `pages/drives/DriveSetupPanel.jsx` | Level, template per level, registration, test window, access code, coordinators. A drive cannot be published or opened until each allowed level has an active template the bank can fill. |
| Students and credentials | `backend/src/modules/applications`, admin `pages/students` | Coordinator registers, verifies identity, issues a one-time temporary password. |
| Student sign-in | `backend/src/modules/candidate-auth`, `middleware/candidate-*.ts` | Login ID = application number. Own token type and cookie; separate from staff. |
| Assessment engine | `backend/src/modules/assessment`, `modules/candidate` | Terms gate, frozen paper, server deadline, autosave, events, idempotent submit, expiry sweep. |
| Student portal | `frontend/student.html`, `frontend/src/student` | Separate entry point of the existing frontend project; imports nothing from the staff pages. |
| Results and ranking | `backend/src/modules/results`, admin `pages/results`, `pages/dashboard/RankingPanel.jsx` | Competition ranking by score only. Top 10 green, other ranked yellow. |
| HOD / STAFF | roles in `prisma/seed.ts`, `domain/college-scope.ts`, `modules/users/user-colleges.routes.ts` | Results for assigned colleges only; own sign-in pages `/hod/login`, `/staff/login`. |
| Interviews | existing module + `domain/assessment-config.ts` | Default 30 minutes; no double booking. Interview feedback and assessment scores are separate records. |

## 2. Decisions made (change on request)

* HOD and STAFF are **new roles** holding only `results.view`. Neither existing role fits (an interviewer holds `interviews.feedback`; the SRS keeps scores from coordinators). Their college scope is a table (`UserCollege`).
* A student's college for scope purposes = the student's own college, else the drive's college. Unscoped (no college) records are hidden from HOD / STAFF.
* Ranks are computed over the whole drive-and-level population, then filtered by scope, so a rank means the same everywhere.
* Boundary ties: "Top 10" = rank 10 or better, so everyone tied at the boundary is green (more than 10 can be green).
* Coordinator assignment to a drive uses `drives.manage` (HR admin and Super Admin).
* One attempt per application. No retakes. No coordinator reset of a submitted attempt.
* Students never receive correct answers, explanations, marks, scores or ranks, whatever `Setting.showScoreToCandidate` says.
* Integrity: tab-hidden, window-blur and full-screen-exit count toward a review flag (default 3, `INTEGRITY_FLAG_THRESHOLD`). Nothing ends an attempt automatically.

## 3. Still needs YOUR approval

1. **UG marks per topic.** The form offers the proposal OOPs 10 x 1, HTML 10 x 1, CSS 10 x 1, JavaScript 15 x 2 = 60. It is only a button on the form; nothing applies it for you.
2. **PG total marks and per-topic split.** PG has 75 questions; its total is whatever the template author sets (the proposal offered is 15/15/15/30, one mark each = 75).
3. **Question content and topic split** (which questions, how many of each difficulty).
4. **Negative marking** (default 0; total floors at 0).
5. **Terms wording** (`domain/assessment-rules.ts`, version `2026-10-v1`).
6. Credential reset policy and the one-time display of the temporary password to the coordinator.
7. Integrity threshold and review process.

## 4. Database work NOT done (needs explicit authorisation)

* New migration `backend/prisma/migrations/20261013090000_assessment_foundation` (additive; rollback in `backend/prisma/rollback`). Its Part 1 was produced with `prisma migrate diff` between schema files in a scratch copy (no database).
* The two earlier recruitment migrations are also still unapplied to the real database.
* Seed (roles `HOD`, `STAFF` and their `results.view` permission) not run.
* Prisma Client **not regenerated**. The running backend still uses the old client; the new endpoints answer errors until the client is regenerated, and the expiry sweep and publish gate stay idle by design.
* Safe order when authorised: back up, restore the backup to a scratch database, migrate it, run `node scripts/db-preflight.cjs --only=test`, then do the real database, regenerate the client, restart, seed.

## 5. Commands to run locally (none were run by the assistant against a database)

```
cd backend
npx tsc --noEmit
npm test                                    # 270 tests, fakes only
node --check scripts/load-test-assessment.cjs

cd ../admin    && npm run lint
cd ../frontend && npm run lint
```

Later, with authorisation and an isolated database only:

```
node scripts/load-test-assessment.cjs --base=http://localhost:5000/api/v1 \
  --credentials=./load-credentials.json --concurrency=50 \
  --confirm-isolated=I-AM-USING-AN-ISOLATED-DATABASE
```

## 6. Limits worth knowing

* Browser controls (full screen, focus detection, blocked shortcuts) are a deterrent and an evidence trail. They cannot stop a second device, another browser or operating-system shortcuts, and events can be false alarms.
* 50-student capacity is **not proven**. The in-memory simulation (`tests/load-simulation.test.ts`) checks logic only. Capacity needs the load script against a real, isolated database.
* The staff login limiter allows 5 failures per IP per 15 minutes; many staff on one college network should set `LOGIN_RATE_LIMIT` higher. Students are limited per account, not per IP.
* If a student's last autosave lands in the same millisecond as the automatic submit at the deadline, that one answer can be stored but not scored.
