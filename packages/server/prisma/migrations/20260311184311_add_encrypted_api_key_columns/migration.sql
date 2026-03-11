-- AlterTable
ALTER TABLE "users" ADD COLUMN     "api_key_hint" VARCHAR(20),
ADD COLUMN     "encrypted_api_key" TEXT;
