# WM CareerConnect — production readiness

Status of the final audit and what is still needed before real students use the system. Updated with the audit
of the Admin Panel, backend and Student Portal. "Verified" means it was run or observed; "reviewed" means read in
the code only.

## What the backend does at start-up

* `src/lib/config.ts` checks the environment. In production it refuses to start without a database URL, two
  different JWT secrets of at least 32 characters each, and `WEB_ORIGIN`. It warns about non-HTTPS origins and a
  missing `TRUST_PROXY`. A problem names the variable, never its value.
* The expiry sweep now runs (every 30 seconds). Before this change it was imported but never started, so an
  assessment abandoned by closing the browser stayed "in progress" until the student came back.
* `SIGTERM` / `SIGINT` stop the sweep, drain requests and close the database pool.
* Errors are logged through the structured logger. Validation failures are not logged; unexpected errors are, with
  the route. Responses never carry an error message or stack.
* Malformed JSON is `400 INVALID_JSON` and an oversized body `413`; before, both were reported as `500`.

## Go-live checklist (in priority order)

1. **Secrets.** Generate two new random JWT secrets (32+ characters), store them only in the server's environment.
   Rotate the database password if it was ever shared.
2. **HTTPS and domain.** Serve the API, Admin Panel and Student Portal over HTTPS. Set `WEB_ORIGIN` to the exact
   HTTPS origins and `NODE_ENV=production` (this also turns on `Secure` cookies). Set `TRUST_PROXY` to the number of
   proxies in front of the API.
3. **Database.** Use a dedicated PostgreSQL user with only the privileges the app needs, enable automated backups
   and test a restore. Set `DB_POOL_MAX` to fit the server (`max_connections` ÷ number of API processes).
4. **Apply migrations** with `prisma migrate deploy` only (never `migrate dev` or `db push`: the schema has
   constraints Prisma cannot express). Take a verified backup first.
5. **Roles and the first Super Admin.** Run the role/permission seed only on an empty database, with
   `SEED_DEMO_USERS` off. The HOD and STAFF roles are only needed if those portals are used.
6. **Load test on a copy of the database** (100 concurrent students: sign-in, start, answer saving, submission,
   interview loading) before the event. The in-memory simulation passes but does not measure PostgreSQL or bcrypt
   load.
7. **Monitoring.** Point an uptime check at `GET /api/v1/health`, ship the JSON logs somewhere searchable, and
   alert on 5xx rates and on the "could not auto-submit an expired attempt" log line.
8. **Operations.** Run the API under a process manager that restarts it; keep at least two sign-in-capable staff
   accounts so one lock-out is never fatal.

## Services that are NOT needed for the current feature set

* **SMTP / email.** No email is sent: the system has no mailer, registration is verified by a coordinator and the
  email OTP feature is not built. SMTP credentials and a sender authorisation are needed only if you decide to add
  email notifications or OTP.
* **Video-meeting integration.** Interview links are entered by staff; the portal shows a Join button only for a
  valid link. Automatic Google Meet / Zoom / Teams room creation would need an account with API access and OAuth
  credentials, which is optional.

## Known limitations

* Candidate-facing results are intentionally not shown (the `showScoreToCandidate` setting is ignored by design).
* Listing endpoints for applications and results load all rows and filter in memory. This is fine for hundreds of
  students; move the filtering into the database before thousands.
* Per-student interview data has no "rescheduled" marker and no interview type; the portal shows only what the API
  returns.
