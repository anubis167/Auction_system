# rag-2.1: RAG document upload limit raised to 10 MB

SRS Req-1 & Req-3: admin side document upload limit raised from 2 MB to 10 MB (< 10 MB), with chunking and embedding before saving to the database.

## Changes

- `be/rag/chat.py`:
  - `DOC_MAX_BYTES` raised from `2 * 1024 * 1024` to `10 * 1024 * 1024` (10 MB).
  - `MAX_CONTENT_LENGTH` updated to `DOC_MAX_BYTES + 128 * 1024` to accommodate 10 MB multipart uploads.
  - 413 error message updated to `"The file is larger than 10 MB"`.
  - Documents <= 10 MB are chunked via `rag.chunk_text` and embedded with `rag.embed` before storing in `knowledge_documents` and `knowledge_chunks`.

## Verification

- `python -m unittest discover -s be/rag -p "*_test.py"`: 37/37 tests OK.
- `be/rag/rag_docs_test.py`: 6/6 tests OK, including rejection above 10 MB (`DOC_MAX_BYTES + 1`) returning HTTP 413.
