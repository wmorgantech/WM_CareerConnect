# WM CareerConnect — Requirements Traceability and Schema Proposal

Source of truth: `WM_CareerConnect_Requirements.md` (SRS, draft v1, 4 Oct 2026).
Update (database-preparation stage): the schema and migration for the BLOCKED (schema) rows now exist and are tested on a scratch database but are **not applied** to any named database: see `docs/schema-proposal.md`. The Admin app now covers the staff modules (colleges, users, drives, candidates, interviews, reports, settings, audit logs) against the existing tables. The candidate flow, test engine and coordinator tools remain unbuilt: see `docs/candidate-implementation-plan.md`. Rows below still show the status before the migration is applied.

Status values: **DONE** (implemented and tested), **PARTIAL**, **MISSING**, **BLOCKED** (needs an approval or a decision; reason given).
Nothing in this file has been applied to any database. No migration was created or run.

## 0. Stack differences between the SRS and this repository

| SRS | Repository | Treatment |
|---|---|---|
| Next.js 14 candidate web + admin routes in one app | Three separate Vite/React apps: `frontend/` (candidate), `admin/`, `backend/` | Keep the three-app layout (your instruction). |
| pnpm monorepo, shared Zod package | Three independent npm projects | Candidate rules live in `backend/src/domain`; the frontends cannot import them. Duplicate small validators or add a shared package later (decision). |
| Zod-to-OpenAPI / Swagger, Docker, Playwright E2E, PWA | None present | MISSING (Phases 6-7 of the SRS). |
| Excel export (ExcelJS) | CSV only | MISSING. |
| Email via Nodemailer + SMTP | No mailer | BLOCKED: needs SMTP settings (env change) and a decision on a dev fallback. |

## 1. Roles and permissions (SRS section 4 versus what is seeded)

| Item | SRS | Current seed | Gap |
|---|---|---|---|
| Super Admin | all | all 19 | none |
| HR Admin | colleges create/edit, drives, candidates, shortlist/reject, interviews.schedule, reports; no users/settings/questions/audit | has `colleges.manage` (includes delete), `candidates.manage` (not in SRS) | Decide whether HR may delete colleges. `candidates.manage` is an extra permission not in the SRS. |
| Campus Coordinator | drives (assigned only), register candidates, monitor, completion status only | `candidates.register`, `candidates.viewAll`, `testStatus.monitor` | Needs drive-assignment scoping (`DriveCoordinator`) and a `drives` view permission. |
| Interviewer | assigned shortlisted candidates, feedback on own interviews | `interviews.feedback`, `candidates.viewAll`, `results.view` | Needs panelist scoping through `InterviewPanelist`. |
| Candidate | own data only, view open drives, own interviews, status | `candidates.register`, `results.view` | Needs a separate OTP identity (see section 3). |
| Enforcement | API is the real gate | `requirePermission` on every route; data scoping only for interviews | Scoping for coordinators, interviewers and candidates is MISSING. |

Changing the seeded permissions is a data change that needs the seed to run, so it is BLOCKED on approval.

## 2. Traceability matrix

| SRS | Requirement | Backend today | Admin today | Candidate app today | Status |
|---|---|---|---|---|---|
| 5.1-5.2 | Open link / QR, pick active drive, optional 6-char access code | Drive has title, college, dates, status only. No access code, no public drive list. Access-code generation/compare helpers added (`domain/candidate-registration.ts`, tested). | n/a | none | BLOCKED (schema) |
| 5.3 | One-page registration with all listed fields and consent | Field rules, mobile format, qualification list, passing-year range, consent, experience rule implemented and tested as a Zod schema. No endpoint, no storage for most fields. | n/a | none | BLOCKED (schema) |
| 5.4 | UG/PG selection with auto-suggestion | `suggestLevel` implemented and tested. | n/a | none | PARTIAL (logic only) |
| 5.5 | Email OTP (6 digits, 5 min), coordinator manual verify | OTP generation, keyed hash, expiry, attempt limit implemented and tested. No table, no mailer, no endpoints. | n/a | none | BLOCKED (schema + SMTP) |
| 5.6-5.8 | Instructions, take test, confirmation with Application ID and email | `formatApplicationNumber` tested. Nothing else. | n/a | none | BLOCKED |
| 5 | Duplicate rule: one application per email+mobile per drive; resume the existing attempt | Needs `Application` with unique (drive, email) and (drive, mobile). | n/a | none | BLOCKED (schema; existing duplicate candidate emails need a decision) |
| 5 | Candidate login by email OTP, view status / interview | none | n/a | `/candidate` is a placeholder | BLOCKED |
| 6 | Test templates UG 60/60 and PG 75/75 with section marks | Paper generator proves the section arithmetic (60 and 75). No template tables, no seed. | none | none | BLOCKED (schema) |
| 6 | Question bank CRUD + Excel/CSV import with row-level errors | none | none | n/a | BLOCKED (schema, ExcelJS dependency) |
| 6 | Paper generation: per-section random pick, difficulty mix, shuffled questions and options, stored on the attempt | `generatePaper` implemented and tested (mix, shortage fill, no duplicates, seedable, no answer key in output). Storage missing. | n/a | none | PARTIAL (logic only) |
| 6 | Server-authoritative timer, +30 s grace, auto-submit, resume | Deadline/grace/remaining/auto-submit rules implemented and tested. No attempt table or endpoints. | n/a | none | PARTIAL (logic only) |
| 6 | Autosave, one-question-per-screen UI, palette, mark for review, review screen | none | n/a | none | BLOCKED |
| 6 | Integrity: tab-switch count, no copy/paste | none | n/a | none | BLOCKED |
| 6 | Scoring, per-section score, percentage, time, rank in drive | `scoreAttempt`, `rankAttempts` implemented and tested (policies noted in code). | none | none | PARTIAL (logic only) |
| 7 | Status lifecycle with history | `application-status.ts` tested (policy choices flagged). No `Application` / history table. | none | none | PARTIAL (logic only) |
| 7 | Bulk shortlist by score with preview, manual override | Needs applications and scores. | none | n/a | BLOCKED |
| 8 | Interview scheduling with rounds, panelists, link, email invites | Interview model has one interviewer, no round, no panel; scheduling API exists (staff-side). No email. | none (module not built in Admin) | none | PARTIAL |
| 8 | Interviewer "My Interviews" and join link | `GET /interviews` scoped to own for non-schedulers. | none | n/a | PARTIAL |
| 8 | Feedback: five 1-5 ratings, strengths, concerns, comments, recommendation; lock after submit; Super Admin unlock | Single free-text + 0-100 score; lock/unlock implemented and audited. | none | n/a | PARTIAL (feedback shape differs from the SRS) |
| 8 | Final HR decision after seeing recommendations | none | none | n/a | BLOCKED |
| 9 | Users & Roles: create/deactivate, assign role, reset password | CRUD, status, password reset via update, self-lockout and last-admin protection, audit. Role editing is read-only. | none | n/a | DONE (backend) / MISSING (Admin UI) |
| 9 | Assign coordinators to drives | none | none | n/a | BLOCKED (schema) |
| 9 | Colleges (name, city, contact, phone, email) | CRUD | none | n/a | DONE (backend) / MISSING (Admin UI) |
| 9 | Drives with access code, level, registration toggle, test window, multi-college, status | Basic CRUD only | none | n/a | PARTIAL |
| 9 | Settings: OTP on/off, show score, SMTP, retention | Company profile fields only | none | n/a | PARTIAL / BLOCKED (schema + SMTP secrets handling) |
| 9 | Audit log: logins, status changes, exports, settings | Implemented for login/logout/users/colleges/drives/candidates/interviews/settings/exports | none | n/a | DONE (backend) / MISSING (Admin UI) |
| 9 | Dashboard (active drives, registrations, tests running, submitted, shortlisted, selected) | 4 counts only | Dashboard shows those 4 | n/a | PARTIAL |
| 9 | HR candidate list with filters, candidate detail | Staff candidate CRUD with search | none | n/a | PARTIAL (not the SRS candidate/application model) |
| 9 | Reports: drive summary, score distribution, section averages, college comparison, funnel; CSV/Excel export | Basic list reports + CSV (capped at 100 rows, formula-safe) | none | n/a | PARTIAL |
| 9 | Coordinator: my drives, QR + code, register on behalf, live monitor, help actions | none | none | n/a | BLOCKED |
| 11 | Public/candidate/staff/admin/coordinator API set | Staff auth + admin CRUD subset only | n/a | n/a | PARTIAL |
| 12 | Security: rate limits, CORS, Zod, bcrypt, helmet, Pino, health check | Present | n/a | n/a | DONE |
| 12 | Concurrency (300+ simultaneous test takers), mobile performance budget | not measured | n/a | none | NOT VERIFIED |
| 12 | Timezone: UTC storage, IST display | Done in Admin/main frontend utilities | partial | none | PARTIAL |
| 13 | Seed data (templates, 2x questions per section, demo drive with code) | Roles, permissions, demo users, demo college only | n/a | n/a | BLOCKED (schema + seed run) |
| 14 | Tests (unit scoring/paper/authorization, integration, Playwright E2E) | 73 backend tests (24 for the new domain logic); no E2E | none | none | PARTIAL |
| 15 | Acceptance: 1-minute registration, resume after refresh, auto-submit, per-role 403s | not achievable until candidate flow exists | | | NOT VERIFIED |

## 3. Schema changes required (proposal, NOT applied)

**Why a migration is unavoidable.** The SRS pipeline is Candidate -> Application -> TestAttempt -> Interview. The current schema has a staff-entered `Candidate` (name, email, phone, college, resume URL), a single-interviewer `Interview` and no drive-candidate link, test tables, OTP table, coordinator assignment or panel.

**Approach: additive only.** New tables and new nullable/defaulted columns. Nothing is dropped, renamed or rewritten. Existing rows stay valid and the existing APIs keep working.

New enums: `TestLevel` (UG, PG, BOTH), `ApplicationStatus` (9 values, see `domain/application-status.ts`), `Difficulty` (EASY, MEDIUM, HARD), `QuestionType` (MCQ_SINGLE; the others reserved), `AttemptStatus` (IN_PROGRESS, SUBMITTED, AUTO_SUBMITTED), `Recommendation` (SELECTED, HOLD, REJECTED).

Changes to existing tables (all columns nullable or defaulted):
- `Drive`: `accessCode`, `levelAllowed` (default BOTH), `registrationOpen` (default false), `testStartsAt`, `testEndsAt`.
- `Candidate`: `mobile`, `city`, `qualification`, `department`, `passingYear`, `experience`, `yearsOfExperience`, `consentAt`, `emailVerifiedAt`. No new unique index on `Candidate.email` (existing duplicate emails are allowed today).
- `Interview`: `applicationId` (nullable), `roundName`. Legacy `interviewerId`, `feedback`, `score` and lock columns stay as they are.
- `Setting`: `otpEnabled`, `showScoreToCandidate`, `retentionDays`; SMTP fields are not stored in this table (see decision D3).

New tables:
`DriveCollege`, `DriveCoordinator`, `Application` (candidate + drive + level + status + applicationNo, unique per drive on email and on mobile through denormalised columns), `ApplicationStatusHistory`, `TestTemplate`, `TestTemplateSection`, `Question`, `QuestionOption`, `TestAttempt`, `AttemptQuestion`, `AttemptAnswer`, `InterviewPanelist`, `InterviewFeedback`, `OtpCode` (stores only the keyed hash, attempts, expiry, usedAt).

**Risks.**
- Existing interviews have no application: they stay legacy rows (`applicationId` null) and keep working; a back-fill needs a rule for which drive they belong to.
- Existing duplicate candidate emails block any global uniqueness. Uniqueness is on `Application` per drive, as the SRS requires.
- A unique-per-drive index on `Application` needs both email and mobile copied onto the row; it must be created after any pre-existing rows are cleaned (none exist yet).
- The migration must first run on a copy of the database (`wm_careerconnect_itest` style), never on the real one without your approval. No reset, drop or truncate is part of it.

## 4. Decisions needed before building the blocked parts

| ID | Decision | Default I would use |
|---|---|---|
| D1 | Approve the additive migration in section 3 (run first on the isolated test database). | none: blocked until approved |
| D2 | Candidate identity: separate OTP-issued token (type `candidate`) in the same JWT scheme, or a User row per candidate? | Separate candidate token type, no User row |
| D3 | Where do SMTP credentials live? Env variables are safest; SRS lists "SMTP config" under Settings. | Env variables; Settings only shows whether email is configured |
| D4 | Email in development without SMTP: log the OTP to the server console only in non-production? | Yes, non-production only |
| D5 | Existing duplicate candidate emails: merge, keep as legacy, or ignore for the new model? | Keep legacy rows untouched; new flow creates its own |
| D6 | Policies in code that the SRS leaves open: cancelled interview returns to SHORTLISTED; ON_HOLD can become SELECTED/REJECTED; HR override limited to decision statuses; rank tie-break by time; OTP max 5 wrong tries; passing-year window -15/+5; negative-marking total floored at 0; B.E/B.Tech and Other have no auto level. | As coded; change on request |
| D7 | May HR delete colleges, and should `candidates.manage` stay? | Keep as is until told |
| D8 | Question bank import format (columns) and the Excel dependency (`exceljs`). | Template with the SRS question fields |
| D9 | Share validation code between apps through a shared package? | Defer; duplicate the few rules |

## 5. What has been built so far toward the SRS

Pure, database-free logic with 26 unit tests: `backend/src/domain/` (`application-status`, `test-paper`, `scoring`, `attempt-timer`, `otp`, `candidate-registration`). These contain rules the SRS defines exactly (60/75-mark papers, +30 s grace, 5-minute 6-digit OTP, 6-character access code without look-alikes, `WMC-YYYY-NNNNN`). They are not yet wired to any endpoint.
