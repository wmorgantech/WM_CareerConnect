-- REVERSE of prisma/migrations/20261012150000_add_drive_template.
-- Prisma has no automatic "down" migration; this file is kept OUTSIDE prisma/migrations so
-- Prisma never runs it by itself. Run it by hand, in the same database, only after a backup.
--
-- WHAT IT DOES: removes the DriveTemplate table and the unique index added on TestTemplate.
-- WHAT IT LOSES: every drive-to-template mapping created after the migration was applied.
-- Existing tables, rows, columns and the first recruitment migration are not touched.
-- Tested on a disposable scratch database (see docs/d1-d2-implementation-proposal.md).

BEGIN;

-- Dropping the table also drops its primary key, index and both foreign keys.
DROP TABLE "DriveTemplate";

-- The unique index existed only to be the target of the composite foreign key.
DROP INDEX "TestTemplate_id_level_key";

-- Forget that the migration ran, so `prisma migrate deploy` would offer it again.
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261012150000_add_drive_template';

COMMIT;
