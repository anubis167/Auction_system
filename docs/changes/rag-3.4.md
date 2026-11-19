# rag-3.4: Complete Write and Retrieve Data APIs for RAG System with Soft Delete

SRS: write me all api for write, retrieve datas for RAG chatbox system; All delete mean soft delete.

## Changes

- `be/rag/rag.py`:
  - Implemented `get_document(conn, doc_id)`:
    - Queries `knowledge_documents` where `id = %s` and `deleted_at IS NULL`.
    - Queries associated `knowledge_chunks` ordered by `position ASC`.
    - Returns document metadata dictionary including list of chunks or None if soft-deleted / not found.
  - Verified `soft_delete_document(conn, doc_id)` sets `deleted_at = now()` on both `knowledge_documents` and child `knowledge_chunks`.
  - Verified `retrieve(conn, query_vec, ...)` and `list_documents(conn)` strictly exclude soft-deleted records (`WHERE deleted_at IS NULL`).

- `be/rag/chat.py`:
  - `POST /api/docs`:
    - Handles multipart document uploads (`.txt`, `.md`, `.pdf`).
    - Splits text into chunks via `rag.chunk_text`.
    - Computes vector embeddings via `rag.embed(client, chunks, "RETRIEVAL_DOCUMENT")`.
    - Stores document and chunks in PostgreSQL transaction with `uploaded_by_id = g.user["id"]`.
    - Returns HTTP 201 `{"id": doc_id, "title": title, "chunks": count}`.
  - `GET /api/docs`:
    - Returns list of all active documents (`id`, `title`, `filename`, `created_at`, `chunk_count`).
  - `GET /api/docs/<int:doc_id>`:
    - Returns details for specified document including metadata and list of chunk records.
    - Returns HTTP 404 if document does not exist or has been soft-deleted.
  - `POST /api/rag/retrieve`:
    - Accepts JSON payload `{"query": "..."}`.
    - Returns HTTP 400 if query is missing or empty.
    - Computes query embedding with `RETRIEVAL_QUERY` task type and retrieves top matching chunks based on cosine distance.
    - Returns HTTP 200 with list of matching chunks (`id`, `title`, `text`, `distance`).
  - `DELETE /api/docs/<int:doc_id>`:
    - Calls `rag.soft_delete_document(conn, doc_id)`.
    - Sets `deleted_at = now()`.
    - Returns HTTP 204 No Content on success.
    - Returns HTTP 404 if document not found or already deleted.

- `be/rag/rag_api_test.py`:
  - Created 8 API integration unit tests covering:
    - `test_post_docs_chunks_and_embeds`: Verifies document upload, chunking, embedding, DB persistence, and 201 status.
    - `test_get_docs_list`: Verifies listing of active documents.
    - `test_get_doc_detail`: Verifies single document details with chunk list.
    - `test_get_doc_detail_not_found`: Verifies 404 for nonexistent document.
    - `test_retrieve_chunks`: Verifies query embedding and retrieval of relevant chunks.
    - `test_retrieve_empty_query`: Verifies 400 for empty or missing query string.
    - `test_soft_delete_lifecycle`: Verifies soft delete sets deleted_at, returns 204, subsequent GET returns 404, and excluded from retrieval search.
    - `test_prompt_injection_intercepted`: Verifies prompt injection payloads on retrieve and docs endpoints are blocked with 400.

## Verification

- `python -m unittest be/rag/rag_api_test.py`: 8/8 tests passed.
- `python -m unittest discover -s be/rag -p "*_test.py"`: 92/92 tests passed (0 failures, 0 errors).
- `npm run test:py`: 92/92 tests passed.
