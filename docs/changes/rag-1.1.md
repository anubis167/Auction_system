# rag-1.1: document and chunk tables

Storage for the RAG chat box (SRS Req-3). Delete is soft (`deleted_at`).

## Changed files

- `be/prisma/schema.prisma`: models `KnowledgeDocument` (`knowledge_documents`) and `KnowledgeChunk` (`knowledge_chunks`); `User.knowledgeDocuments` back-relation
- `be/prisma/migrations/*_knowledge_documents/migration.sql`: the two tables, FK to users and documents, unique (document_id, position), index on document_id
- `be/rag_db_test.py`: integration test on `auction_test` (insert, read back, unique position, soft delete keeps rows); rolls back, skips if Postgres is down

## Notes

- `embedding` is `DOUBLE PRECISION[]`, ranked in Python (no pgvector in postgres:16-alpine).
- Python reads/writes these tables with `psycopg` (installed: 3.3.9). It goes into `be/requirements.txt` in rag-1.6.
