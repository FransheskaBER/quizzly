-- Rename access_tokens table to refresh_tokens and truncate existing rows.
-- All existing sessions are invalidated — users re-login once.

ALTER TABLE "access_tokens" RENAME TO "refresh_tokens";

TRUNCATE TABLE "refresh_tokens";
