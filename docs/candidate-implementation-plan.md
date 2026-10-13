# Candidate Backend and Portal: Implementation Plan

Status: **plan only.** Nothing here is built, connected to a database, or claimed complete. It depends on the schema in `docs/schema-proposal.md` being approved and applied first (the code needs the regenerated Prisma client, which only exists after the migration, see section 9).
Source: `WM_CareerConnect_Requirements.md` sections 5-9, 11-12, 14. Decisions D2-D6 as agreed (separate OTP candidate token; SMTP from environment variables; OTP logged to the console only in development; existing duplicate candidates untouched; lifecycle, ranking and OTP defaults as coded in `backend/src/domain`).

## 1. What already exists (tested, not yet wired to endpoints)

`backend/src/domain/`: application status lifecycle, test paper generation (UG 60 / PG 75, difficulty mix, shuffles, no answer key), scoring and ranking, server timer rules (+30 s grace, remaining time, auto-submit), OTP rules (6 digits, 5 min, keyed hash, 5 tries), registration validation (mobile, consent, experience, passing year), UG/PG suggestion, drive access codes, application numbers. 26 unit tests. Admin app: staff modules (colleges, drives, candidates, interviews, users, reports, settings, audit) against the existing tables.

## 2. Backend modules to build

| Module | Responsibility | Tables | Key rules |
|---|---|---|---|
| `candidate-auth` | request/verify email OTP, issue and refresh candidate session, logout | `OtpCode`, `CandidateSession`, `Candidate` | separate token type; OTP stored as keyed hash; per-email and per-IP rate limits; generic responses (no account enumeration); dev-only console delivery |
| `mailer` | SMTP abstraction (Nodemailer) | none | config from environment only; production fails safely (no OTP/log leakage) when email is unavailable |
| `public-drives` | list open drives, verify access code | `Drive`, `DriveCollege`, `College` | only registration-open drives; constant-time code compare; rate limited |
| `registration` | create candidate + application in one transaction | `Candidate`, `CandidateSkill`, `Application`, `ApplicationCounter`, `ApplicationStatusHistory` | `buildRegistrationSchema`; per-drive uniqueness (409 → resume); application number from the counter; status `REGISTERED`; consent timestamp |
| `candidate-attempts` | start/resume, read paper, autosave, submit, tab events | `TestAttempt`, `AttemptQuestion`, `AttemptAnswer`, `Question`, `QuestionOption`, `TestTemplate*` | `generatePaper` stored once; `computeDeadline`; reject answers after deadline + 30 s; idempotent submit; `scoreAttempt` server side; never send `isCorrect` |
| `candidate-me` | own application, status, interviews, result visibility | `Application`, `Interview`, `InterviewPanelist` | everything derived from the token's `candidateId`; score shown only if `Setting.showScoreToCandidate` |
| `question-bank` | CRUD, filters, Excel/CSV import with row errors, template download | `Question`, `QuestionOption` | SUPER_ADMIN only (`questions.manage`); exactly one correct option; ExcelJS dependency (needs approval) |
| `test-templates` | edit sections, duration, mix, negative marking; seed UG/PG | `TestTemplate`, `TestTemplateSection` | SUPER_ADMIN only (`tests.manage`) |
| `applications` (staff) | list/filter, detail, status change, bulk shortlist/reject with preview, manual override | `Application`, history | `canTransition`; permission `candidates.shortlist/reject`; audit |
| `coordinator` | my drives, QR/code data, register on behalf, live monitor, resend OTP, manual verify | `DriveCoordinator`, `Application`, `TestAttempt` | scoped by `DriveCoordinator`; no scores |
| `interviews` v2 | rounds, panelists, invites, structured feedback, final decision | `Interview`, `InterviewPanelist`, `InterviewFeedback` | panel scoping; feedback lock/unlock reused; legacy interviews keep working |
| `drives` v2 | access code (generate/regenerate), level, registration toggle, test window, colleges, coordinators | `Drive`, `DriveCollege`, `DriveCoordinator` | extends the existing module, no duplicate API |
| `reports` v2 / `settings` v2 | funnel, score distribution, section averages, college comparison, Excel export; OTP on/off, show score, retention | existing + new | ExcelJS; audit exports |

## 3. Endpoints (SRS section 11, mapped to the existing `/api/v1`)

Public / candidate (candidate token unless "public"):
`GET /drives/active` (public) · `POST /drives/:id/verify-code` (public, rate limited) · `POST /candidates/register` (public) · `POST /auth/otp/send` (public, rate limited) · `POST /auth/otp/verify` (public) · `GET /me/application` · `POST /attempts/start` · `GET /attempts/:id` · `PATCH /attempts/:id/answers` · `POST /attempts/:id/submit` · `POST /attempts/:id/events` · `GET /me/interviews`.
Staff (existing token, permission-checked): `/questions` (+`/import`, `/template`) · `/test-templates` · `/applications/:id/status` · `/applications/bulk-status` · `/drives/:id/coordinators` · `/coordinator/drives` · `/coordinator/drives/:id/monitor` · `/interviews/:id/panel` · `/exports/*`. Existing routes stay unchanged (`/drives`, `/candidates`, `/interviews`, `/reports`, `/settings`, `/audit-logs`, `/users`, `/roles`).
Note: the SRS lists `/candidates` for filters; the existing `/candidates` is the staff record API. The SRS "candidate list with filters" becomes `GET /applications` to avoid changing the existing contract.

## 4. Authentication and isolation design

- Candidate access token: JWT with `type: "candidate"`, `sub = candidateId`, `sid = CandidateSession.id`; staff middleware rejects it and candidate middleware rejects staff tokens.
- Refresh: HttpOnly cookie with a different name and path than the staff cookie; rotation on the same session row, as for staff.
- Resource ownership: every candidate query is written as `where: { id, candidateId: token.candidateId }`; ids from the client are never trusted on their own.
- Coordinators/interviewers: scope by `DriveCoordinator` / `InterviewPanelist` inside the service layer (not only in controllers).
- Rate limits: OTP send (per email and per IP), OTP verify, code verify, answer save (generous but bounded), login (existing).
- Audit: registrations, OTP verification outcomes (no codes), attempt start/submit, status changes, exports, manual verification.

## 5. Transactions and concurrency

- Registration: one transaction (counter increment → candidate → application → history). The unique (drive, email/mobile) constraints are the final guard; a violation returns "resume" instead of a duplicate.
- Start attempt: `upsert` on the unique `applicationId`; paper generated once and stored; a second start returns the same attempt with remaining time.
- Autosave: single-row upsert on (`attemptId`,`questionId`); deadline check uses the stored `deadline`; no joins on the hot path; designed for 300+ concurrent takers.
- Submit/auto-submit: guarded update `WHERE status = IN_PROGRESS`, so repeated calls and the periodic expiry sweep (index on `status, deadline`) cannot double-score.
- Status changes: `assertTransition` plus a conditional update on the previous status (no lost updates), history row in the same transaction.

## 6. Candidate portal (`frontend/`): pages and design

Today `frontend/` is the staff app (admin and interviewer screens) plus a placeholder `/candidate`. Per the three-app architecture, the order is: finish `admin/` parity first, then convert `frontend/` into the candidate portal and remove the staff routes from it. Until then the existing screens keep working.

Visual identity: distinct from the Admin console: mobile-first, one task per screen, large touch targets (44 px+), a "what to do next" panel, stepper for registration, plain language, light surfaces with the brand green/red used sparingly. Performance budget: test route code-split from everything else, no heavy dependencies.

| Screen | Backend |
|---|---|
| Landing: pick an open drive, optional access code | `GET /drives/active`, `POST /drives/:id/verify-code` |
| One-page registration (SRS 5.3) with level suggestion and consent | `POST /candidates/register` |
| Email OTP verify / resend | `POST /auth/otp/send|verify` |
| Instructions and start | `POST /attempts/start` |
| Test: one question per screen, section tabs, palette, mark for review, server-timer countdown, autosave with retry, tab-switch events, final review and confirm | `GET /attempts/:id`, `PATCH …/answers`, `POST …/events`, `POST …/submit` |
| Confirmation with application number | `GET /me/application` |
| My status, interview schedule and join link, result if allowed | `GET /me/application`, `GET /me/interviews` |

Reuse (logic only, not visuals): the verified fetch/refresh pattern from `admin/src/api/client.js`, error/field-error helpers, IST formatting.

## 7. Phases (each phase ends with tests and a report)

| Phase | Needs | Content |
|---|---|---|
| 0 | approval | apply migration to `wm_careerconnect_itest` only; regenerate client; seed review (separate approval) |
| 1 | 0 | seed script (permissions, templates, question bank); question-bank + template admin APIs and Admin pages |
| 2 | 1 | drives v2 (code, level, window, colleges, coordinators); candidate auth + mailer; registration; public drive APIs |
| 3 | 2 | attempts (start/resume/save/submit/auto-submit/events), scoring, results; candidate test UI |
| 4 | 3 | staff applications list/filters, bulk shortlist/reject, status history; coordinator APIs and mobile UI |
| 5 | 4 | interviews v2 (rounds, panel, invites, structured feedback, decision); candidate "my status" |
| 6 | 5 | dashboards, reports v2, Excel export, audit additions, settings v2, PWA |
| 7 | all | automated tests: unit (domain exists), per-role 403 matrix, isolation tests, concurrency test (300 simulated takers), Playwright E2E for the candidate flow, README |

## 8. Tests that gate each phase

- Role matrix: every route × every role returns the SRS-expected 200/403, including candidate-token-on-staff-route and staff-token-on-candidate-route.
- Isolation: candidate A cannot read or change candidate B's application, attempt, answers or interviews; coordinator cannot read another drive; interviewer cannot read another's interview.
- Registration: duplicate email/mobile per drive, wrong/expired access code, closed registration, consent missing.
- OTP: expiry, wrong code, attempts limit, reuse, rate limit; no OTP or secret in logs in production mode.
- Attempt: refresh/resume keeps answers and timer, late answers rejected after grace, auto-submit, double submit, option from another question rejected (database and API), score and per-section breakdown equal a hand-computed key.
- Lifecycle: every illegal transition rejected; bulk preview equals applied result.
- Real-stack UI tests against the isolated database (not stubs) for the candidate flow on a 360 px viewport.

## 9. Sequencing risk (important)

The Prisma client is generated from `schema.prisma`. After the migration is applied to the database a backend uses, run `prisma generate`, rebuild, then restart that backend. Doing it earlier makes the running backend query columns the database does not have yet. Work on candidate code can therefore only be compiled and tested after phase 0 on the test database; until then only design and the already-built domain logic are available.

## 10. Open items that need your decision before or during build

D3/D4 SMTP provider and sender address (environment variables); whether Excel import/export may add the `exceljs` dependency; the question-bank source (who supplies the 2x question set per section); data-retention behaviour (what is deleted after `retentionDays`); whether the candidate may see the score (default hidden); production origin for the candidate portal in `WEB_ORIGIN`.
