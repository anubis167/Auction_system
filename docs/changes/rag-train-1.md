# rag-train-1 Training log tables

Tables that keep the RAG bot's conversations so they can be reviewed and exported later as training data.
Nothing writes to them yet; rag-train-2 onward adds the writes (through the Node API, Flask still never opens the database).

| File | Change |
|---|---|
| be/prisma/schema.prisma | New models `RagSession` (rag_sessions), `RagTurn` (rag_turns), `RagRetrieval` (rag_retrievals), `RagExample` (rag_examples); back-relations `User.ragSessions`, `User.ragReviews`, `KnowledgeChunk.ragRetrievals`. |
| be/prisma/migrations/20261120090000_rag_training_log/migration.sql | New: the four tables, their indexes and foreign keys. Made with `prisma migrate diff` from the committed schema, so the shared dev db was not touched. |
| e2e/integration/rag-train-1-tables.test.ts | New: stores session -> turn -> retrieval -> example and reads them back; guest sessions; defaults (`raw`, `cited=false`); the three unique keys reject duplicates; foreign keys reject a missing session or chunk. |

## Tables

| Table | One row per | Notes |
|---|---|---|
| rag_sessions | chat session | `user_id` null for guests; `visitor_hash` is the sha256 of the visitor token, never the raw token; soft delete (`deleted_at`). |
| rag_turns | question + answer | unique (`session_id`, `turn_index`); `outcome` answered / refused / handed_off / error; `guard_triggered`; `feedback` up / down; `model`, `prompt_version` (hash of the system prompt), token counts, latency; soft delete (`deleted_at`, used by the retention job in rag-train-8). |
| rag_retrievals | chunk returned for a turn | unique (`turn_id`, `chunk_id`); `rank`, `score`, `cited`. Points at `knowledge_chunks`, which are soft-deleted, so past rows stay readable. |
| rag_examples | reviewed turn | unique `turn_id`; `status` raw / approved / rejected / exported; `label`, `ideal_reply`, reviewer and dates. |

Changes from the first proposal: `rag_turns.deleted_at` added (retention job), and no `ON DELETE CASCADE` (the repo uses soft delete; foreign keys restrict, user links set null).
