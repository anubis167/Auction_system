-- CreateTable
CREATE TABLE "rag_sessions" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT,
    "visitor_hash" VARCHAR(64) NOT NULL,
    "locale" VARCHAR(10),
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "rag_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rag_turns" (
    "id" BIGSERIAL NOT NULL,
    "session_id" BIGINT NOT NULL,
    "turn_index" INTEGER NOT NULL,
    "user_text" TEXT NOT NULL,
    "bot_text" TEXT,
    "outcome" VARCHAR(20) NOT NULL,
    "guard_triggered" VARCHAR(40),
    "feedback" VARCHAR(10),
    "model" VARCHAR(60) NOT NULL,
    "prompt_version" VARCHAR(64) NOT NULL,
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "latency_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "rag_turns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rag_retrievals" (
    "id" BIGSERIAL NOT NULL,
    "turn_id" BIGINT NOT NULL,
    "chunk_id" BIGINT NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "cited" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "rag_retrievals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rag_examples" (
    "id" BIGSERIAL NOT NULL,
    "turn_id" BIGINT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'raw',
    "label" VARCHAR(20),
    "ideal_reply" TEXT,
    "reviewer_id" BIGINT,
    "reviewed_at" TIMESTAMP(3),
    "exported_at" TIMESTAMP(3),

    CONSTRAINT "rag_examples_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rag_sessions_user_id_idx" ON "rag_sessions"("user_id");

-- CreateIndex
CREATE INDEX "rag_sessions_started_at_idx" ON "rag_sessions"("started_at");

-- CreateIndex
CREATE INDEX "rag_turns_created_at_idx" ON "rag_turns"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "rag_turns_session_id_turn_index_key" ON "rag_turns"("session_id", "turn_index");

-- CreateIndex
CREATE UNIQUE INDEX "rag_retrievals_turn_id_chunk_id_key" ON "rag_retrievals"("turn_id", "chunk_id");

-- CreateIndex
CREATE UNIQUE INDEX "rag_examples_turn_id_key" ON "rag_examples"("turn_id");

-- CreateIndex
CREATE INDEX "rag_examples_status_idx" ON "rag_examples"("status");

-- AddForeignKey
ALTER TABLE "rag_sessions" ADD CONSTRAINT "rag_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rag_turns" ADD CONSTRAINT "rag_turns_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "rag_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rag_retrievals" ADD CONSTRAINT "rag_retrievals_turn_id_fkey" FOREIGN KEY ("turn_id") REFERENCES "rag_turns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rag_retrievals" ADD CONSTRAINT "rag_retrievals_chunk_id_fkey" FOREIGN KEY ("chunk_id") REFERENCES "knowledge_chunks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rag_examples" ADD CONSTRAINT "rag_examples_turn_id_fkey" FOREIGN KEY ("turn_id") REFERENCES "rag_turns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rag_examples" ADD CONSTRAINT "rag_examples_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

