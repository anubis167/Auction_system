# Merge: feature/claude-staff (rag2-1.x) + feature/gemini (rag-3.x) — 2026-11-18

The two branches rebuilt `be/rag` differently. Claude's rag2 layout is the base (Python never touches the
database; every read/write goes through Node `/api/rag/*`). Gemini's rag-3 work is ported onto it.

## Kept from gemini
- `be/rag/error_handler.py` (rag-3.1) and `be/rag/security.py` (rag-3.2), registered in `be/rag/chat.py`.
- `GET /api/docs/<id>` and `POST /api/rag/retrieve` (rag-3.4), now via `call_api` / `functions/retrieve.py`.
- New Node route `GET /api/rag/documents/:id` (`be/src/routes/rag.ts`, `knowledge.manage`).
- `Authorization: Bearer <jwt>` accepted alongside the cookie (`visitor_token()` in chat.py); Node verifies it.
- Optional ngrok (`NO_NGROK`) and optional Gemini key (`embed` raises `EmbedError` when no client).
- Tests moved to `e2e/py/rag3_1_error_handler_test.py`, `e2e/py/rag3_2_security_test.py`; new `e2e/py/rag3_4_api_test.py`.

## Dropped from gemini
- `be/rag/auth.py`, `auth_test.py`, `rag_api_test.py`, and gemini's edits to `rag.py` and the round-12 tests:
  they read the database directly, which rag2 removed. Node's session check replaces `auth.py`.

## Behaviour decisions
- `/api/chat` still allows guests (rag-1.7, sch-1.3). `e2e/rag-chat-api.spec.ts` no longer expects 401 there.
- Upload limit is 10 MB (main's rag-2.1): `functions/read_upload.py`, Node zod limit, Node JSON body limit 200 MB
  for the internal upload route (embeddings are ~15 KB per chunk).
- Playwright starts the Flask service with `RAG_API_URL`/`RAG_INTERNAL_TOKEN` pointed at the e2e Node API.

## Archives
- `progress-feature-list/feature_list_14.json`: gemini's round 13 (admin RAG upload).
- `progress-feature-list/feature_list_15.json`: gemini's round 14 (rag-3.x).

## Verified
- `npm run test:py`: 102 tests OK. `tsc --noEmit` on be: clean.
- Not run: Playwright e2e, Node vitest suites (need the Postgres containers).
