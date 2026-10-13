-- REVERSE of prisma/migrations/20261013090000_assessment_foundation.
-- Kept OUTSIDE prisma/migrations so Prisma never runs it by itself. Run by hand, in the same
-- database, only after a backup.
--
-- WHAT IT LOSES: every integrity event, every student credential, every UserCollege
-- assignment, the frozen snapshots on attempt questions, terms acceptance and review flags,
-- and the question count / marks-per-question values of templates.
-- The earlier recruitment migrations and all pre-existing data are not touched.
-- NOT TESTED against any database yet.

BEGIN;

DROP TABLE "UserCollege";
DROP TABLE "CandidateCredential";
DROP TABLE "IntegrityEvent";

-- Dropping a column also drops its foreign key, index and CHECK constraints.
ALTER TABLE "CandidateSession" DROP COLUMN "applicationId";
ALTER TABLE "AttemptAnswer" DROP COLUMN "seq";
ALTER TABLE "AttemptQuestion"
  DROP COLUMN "codeSnippet",
  DROP COLUMN "correctOptionId",
  DROP COLUMN "marks",
  DROP COLUMN "optionsSnapshot",
  DROP COLUMN "questionText";
ALTER TABLE "TestAttempt"
  DROP COLUMN "flaggedForReview",
  DROP COLUMN "integrityEventCount",
  DROP COLUMN "termsAcceptedAt",
  DROP COLUMN "termsVersion";
ALTER TABLE "TestTemplateSection"
  DROP COLUMN "marksPerQuestion",
  DROP COLUMN "questionCount";
ALTER TABLE "TestTemplate" DROP COLUMN "questionCount";

DROP TYPE "IntegrityEventType";

DELETE FROM "_prisma_migrations" WHERE migration_name = '20261013090000_assessment_foundation';

COMMIT;
