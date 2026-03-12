-- AlterTable: add key_source, backfill from is_free_trial, drop is_free_trial
ALTER TABLE "quiz_attempts" ADD COLUMN "key_source" VARCHAR(10);

UPDATE "quiz_attempts" SET "key_source" = 'SERVER_KEY' WHERE "is_free_trial" = true;
UPDATE "quiz_attempts" SET "key_source" = 'USER_KEY' WHERE "is_free_trial" = false;

ALTER TABLE "quiz_attempts" ALTER COLUMN "key_source" SET NOT NULL;

ALTER TABLE "quiz_attempts" DROP COLUMN "is_free_trial";
