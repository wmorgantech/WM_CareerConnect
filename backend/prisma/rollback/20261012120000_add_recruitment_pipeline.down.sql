-- REVERSE of prisma/migrations/20261012120000_add_recruitment_pipeline.
-- Prisma has no automatic "down" migration; this file is kept OUTSIDE prisma/migrations so
-- Prisma never runs it by itself. It is meant to be run by hand, inside the same database, only
-- after a backup has been taken.
--
-- WHAT IT DOES: removes everything the migration added and nothing else. Existing tables,
-- columns, rows and indexes are not touched.
-- WHAT IT LOSES: every row created in the new tables and the values stored in the new columns
-- after the migration was applied. Take a pg_dump first.
-- Tested on a disposable scratch database (see docs/schema-proposal.md).

BEGIN;

-- 1. Tables that depend on other new tables (children first).
DROP TABLE "AttemptAnswer";
DROP TABLE "AttemptQuestion";
DROP TABLE "TestAttempt";
DROP TABLE "InterviewFeedback";
DROP TABLE "InterviewPanelist";
DROP TABLE "ApplicationStatusHistory";

-- 2. Remove the new columns of existing tables that point at new tables
--    (dropping a column also drops its foreign key, index and CHECK constraints).
ALTER TABLE "Interview" DROP COLUMN "applicationId", DROP COLUMN "roundName";

-- 3. Remaining new tables.
DROP TABLE "Application";
DROP TABLE "CandidateSkill";
DROP TABLE "CandidateSession";
DROP TABLE "OtpCode";
DROP TABLE "QuestionOption";
DROP TABLE "Question";
DROP TABLE "TestTemplateSection";
DROP TABLE "TestTemplate";
DROP TABLE "DriveCoordinator";
DROP TABLE "DriveCollege";
DROP TABLE "ApplicationCounter";

-- 4. Remaining new columns of existing tables.
ALTER TABLE "Drive"
  DROP COLUMN "accessCode",
  DROP COLUMN "levelAllowed",
  DROP COLUMN "registrationOpen",
  DROP COLUMN "testStartsAt",
  DROP COLUMN "testEndsAt";

ALTER TABLE "Candidate"
  DROP COLUMN "mobile",
  DROP COLUMN "city",
  DROP COLUMN "qualification",
  DROP COLUMN "department",
  DROP COLUMN "passingYear",
  DROP COLUMN "experience",
  DROP COLUMN "yearsOfExperience",
  DROP COLUMN "consentAt",
  DROP COLUMN "emailVerifiedAt";

ALTER TABLE "Setting"
  DROP COLUMN "otpEnabled",
  DROP COLUMN "showScoreToCandidate",
  DROP COLUMN "retentionDays";

-- 5. Enums (nothing uses them any more).
DROP TYPE "TestLevel";
DROP TYPE "DriveLevel";
DROP TYPE "QuestionLevel";
DROP TYPE "ApplicationStatus";
DROP TYPE "Difficulty";
DROP TYPE "QuestionType";
DROP TYPE "AttemptStatus";
DROP TYPE "Recommendation";
DROP TYPE "ExperienceType";
DROP TYPE "OtpPurpose";

-- 6. Forget that the migration ran, so `prisma migrate deploy` would offer it again.
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261012120000_add_recruitment_pipeline';

COMMIT;
