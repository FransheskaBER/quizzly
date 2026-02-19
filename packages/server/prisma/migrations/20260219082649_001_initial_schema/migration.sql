-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "verification_token" VARCHAR(255),
    "verification_token_expires_at" TIMESTAMPTZ,
    "auth_provider" VARCHAR(20) NOT NULL DEFAULT 'email',
    "google_id" VARCHAR(255),
    "subscription_tier" VARCHAR(20) NOT NULL DEFAULT 'free',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_resets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "goal" TEXT NOT NULL,
    "prompt_config" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_type" VARCHAR(20) NOT NULL,
    "file_size" INTEGER,
    "s3_key" VARCHAR(500),
    "source_url" VARCHAR(2000),
    "extracted_text" TEXT NOT NULL,
    "token_count" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'processing',
    "error_message" VARCHAR(500),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "difficulty" VARCHAR(10) NOT NULL,
    "answer_format" VARCHAR(10) NOT NULL,
    "question_count" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'generating',
    "score" DECIMAL(5,2),
    "materials_used" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quiz_attempt_id" UUID NOT NULL,
    "question_number" INTEGER NOT NULL,
    "question_type" VARCHAR(20) NOT NULL,
    "question_text" TEXT NOT NULL,
    "options" JSONB,
    "correct_answer" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "difficulty" VARCHAR(10) NOT NULL,
    "tags" JSONB DEFAULT '[]',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question_id" UUID NOT NULL,
    "quiz_attempt_id" UUID NOT NULL,
    "user_answer" TEXT,
    "is_correct" BOOLEAN,
    "score" DECIMAL(3,2),
    "feedback" TEXT,
    "is_flagged" BOOLEAN NOT NULL DEFAULT false,
    "answered_at" TIMESTAMPTZ,
    "graded_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_verification_token_key" ON "users"("verification_token");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_resets_token_hash_key" ON "password_resets"("token_hash");

-- CreateIndex
CREATE INDEX "password_resets_user_id_idx" ON "password_resets"("user_id");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_user_id_created_at_idx" ON "sessions"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "materials_session_id_idx" ON "materials"("session_id");

-- CreateIndex
CREATE INDEX "materials_session_id_status_idx" ON "materials"("session_id", "status");

-- CreateIndex
CREATE INDEX "quiz_attempts_session_id_idx" ON "quiz_attempts"("session_id");

-- CreateIndex
CREATE INDEX "quiz_attempts_user_id_idx" ON "quiz_attempts"("user_id");

-- CreateIndex
CREATE INDEX "quiz_attempts_user_id_status_idx" ON "quiz_attempts"("user_id", "status");

-- CreateIndex
CREATE INDEX "quiz_attempts_session_id_created_at_idx" ON "quiz_attempts"("session_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "questions_quiz_attempt_id_idx" ON "questions"("quiz_attempt_id");

-- CreateIndex
CREATE INDEX "questions_quiz_attempt_id_question_number_idx" ON "questions"("quiz_attempt_id", "question_number");

-- CreateIndex
CREATE UNIQUE INDEX "answers_question_id_key" ON "answers"("question_id");

-- CreateIndex
CREATE INDEX "answers_quiz_attempt_id_idx" ON "answers"("quiz_attempt_id");

-- CreateIndex
CREATE INDEX "answers_quiz_attempt_id_score_idx" ON "answers"("quiz_attempt_id", "score");

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_quiz_attempt_id_fkey" FOREIGN KEY ("quiz_attempt_id") REFERENCES "quiz_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_quiz_attempt_id_fkey" FOREIGN KEY ("quiz_attempt_id") REFERENCES "quiz_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
