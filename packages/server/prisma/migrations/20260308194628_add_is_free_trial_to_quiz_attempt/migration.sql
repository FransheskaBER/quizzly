-- AlterTable
ALTER TABLE "quiz_attempts" ADD COLUMN     "is_free_trial" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: mark all pre-existing quiz attempts as free-trial so grading
-- enforcement does not require a BYOK key for quizzes generated before this feature.
UPDATE "quiz_attempts" SET "is_free_trial" = true WHERE "is_free_trial" = false;
