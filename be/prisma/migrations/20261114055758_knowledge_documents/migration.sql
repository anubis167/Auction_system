-- CreateTable
CREATE TABLE "knowledge_documents" (
    "id" BIGSERIAL NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "content" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_by_id" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_chunks" (
    "id" BIGSERIAL NOT NULL,
    "document_id" BIGINT NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_chunks_document_id_idx" ON "knowledge_chunks"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_chunks_document_id_position_key" ON "knowledge_chunks"("document_id", "position");

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "knowledge_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
