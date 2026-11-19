# rag-3.5: E2E Integration Test Suite for RAG Chatbox APIs

SRS: with e2e function, unit and intergration tests write to e2e folder; Write changed description (files, changed in code) to docs folder.

## Changes

- `e2e/rag-chat-api.spec.ts`:
  - Created comprehensive Playwright API integration test suite covering all Round 14 requirements:
    1. **Req-3: Global Error Handling**:
       - Non-existent route returns HTTP 404 with Content-Type `application/json` and body `{"error": "<message>"}`.
       - Invalid HTTP method (e.g. `PUT /api/chat`) returns HTTP 405 with `{"error": "Method Not Allowed"}`.
       - Invalid body (e.g. empty query on `/api/rag/retrieve`) returns HTTP 400 with `{"error": "Query is required"}`.
    2. **Req-2: Prompt Ejection / Injection Security Middleware**:
       - Intercepts prompt injection payloads on `POST /api/rag/retrieve` (e.g. "ignore previous instructions", "system prompt leak", "DAN mode enabled", "Disregard prior directives") returning HTTP 400 `{"error": "Prompt injection detected"}`.
       - Intercepts prompt injection payloads on `POST /api/chat` with HTTP 400 `{"error": "Prompt injection detected"}`.
       - Intercepts prompt injection strings in query parameters with HTTP 400 `{"error": "Prompt injection detected"}`.
       - Valid benign queries pass through the security filter without obstruction.
    3. **Req-1: Authentication & Authorization Enforcement**:
       - Unauthenticated requests to `/api/chat`, `/api/rag/retrieve`, and `/api/docs` return HTTP 401 `{"error": "Authentication required"}`.
       - Forged / invalid signature Bearer tokens return HTTP 401 `{"error": "Authentication required"}`.
       - Expired Bearer tokens return HTTP 401 `{"error": "Authentication required"}`.
       - Regular customers (`alice`) are forbidden from `/api/docs` (GET, GET by ID, DELETE) with HTTP 403 `{"error": "Forbidden"}`.
       - Regular customers are authorized to access `/api/rag/retrieve` (HTTP 200).
       - Staff and Admin are authorized to access `/api/docs` (HTTP 200).
    4. **Write, Retrieve Lifecycle & Soft Delete**:
       - Staff uploads markdown document via `POST /api/docs`, receiving HTTP 201 with document ID and chunk count.
       - Retrieves document list via `GET /api/docs`, verifying the active document is present with metadata.
       - Retrieves document details via `GET /api/docs/<id>`, verifying metadata and chunk list with position and text.
       - Retrieves relevant chunks via `POST /api/rag/retrieve`, verifying matching chunks returned with cosine similarity score > 0.5 without calling Gemini generate content.
       - Soft-deletes document via `DELETE /api/docs/<id>`, returning HTTP 204 No Content.
       - Verifies exclusion from all future retrieval:
         - `GET /api/docs/<id>` returns HTTP 404 `{"error": "Document not found"}`.
         - `GET /api/docs` list excludes the soft-deleted document.
         - `POST /api/rag/retrieve` excludes chunks from the soft-deleted document.
         - Duplicate `DELETE /api/docs/<id>` returns HTTP 404 `{"error": "Document not found"}`.

- `fe/vite.config.ts`:
  - Added proxy route `'/api/rag': process.env.CHAT_URL ?? 'http://127.0.0.1:5000'` so Vite dev server correctly forwards `/api/rag/retrieve` requests to the Flask chat/RAG backend.

- `playwright.config.ts`:
  - Added python webServer configuration for `python be/rag/chat.py` on port 5000 with `DATABASE_URL: E2E_DB`, `JWT_SECRET: 'e2e-secret'`, and `NO_NGROK: '1'` to allow automated end-to-end testing against the Flask service.

- `be/rag/chat.py`:
  - Guarded ngrok initialization in `__main__` with `if not os.getenv("NO_NGROK") and os.getenv("NGROK_AUTHTOKEN"):` to prevent blocking or failing during test execution.

## Verification

- `npx playwright test e2e/rag-chat-api.spec.ts`:
  - 4/4 passed (100% pass rate).
- `python -m unittest discover -s be/rag -p "*_test.py"`:
  - 92/92 passed (100% pass rate across all 11 test modules).
- `npm test -w fe`:
  - 27/27 test files passed, 165/165 tests passed.
