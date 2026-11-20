-- rag-train-5: a visitor may opt out of having their chats saved; their session row says so and gets no turns
ALTER TABLE "rag_sessions" ADD COLUMN "logging_consent" BOOLEAN NOT NULL DEFAULT true;
