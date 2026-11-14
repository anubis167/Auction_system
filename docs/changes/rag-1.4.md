# rag-1.4: upload, list and soft-delete knowledge documents

Staff and admin manage the documents the chat box answers from. HTTP only (no UI page this round).

## API (served by be/chat.py, port 5000; Vite proxies /api/docs there)

| Call | Result |
|---|---|
| `POST /api/docs` multipart `file` (.txt / .md, UTF-8, max 2 MB), optional `title` | 201 `{id, title, chunks}`; 400 wrong type / not UTF-8 / empty; 413 too big; 503 embedding failed after retries (nothing stored) |
| `GET /api/docs` | 200 `{documents: [{id, title, filename, sizeBytes, createdAt, chunks}]}`, newest first, deleted ones left out |
| `DELETE /api/docs/<id>` | 204, sets `deleted_at` (soft delete); 404 unknown or already deleted |

All three: 401 without a valid session, or for a locked / disabled / deleted user; 403 for customers.

## Auth

The browser already sends the Node API's httpOnly cookie `auction_token` to /api/docs (same origin through Vite). Python checks it like `readUser` + `loadSessionUser` in be/src/middleware/auth.ts: HS256 with `JWT_SECRET` (fallback `dev-secret`, as be/src/config.ts), `exp` in the future, then role and status re-read from `users`. No JWT library: hmac + base64 from the standard library.

## Changed files

- `be/rag.py`: `COOKIE`, `BLOCKED_STATUSES`, `connect()` (psycopg, one connection per request), `read_token`, `session_user`, `save_document` (one transaction), `list_documents`, `delete_document`
- `be/chat.py`: `DOC_MAX_BYTES`, `MAX_CONTENT_LENGTH` (2 MB + 64 KB, applies to every route), `DOC_TYPES`, `staff_only`, routes `upload_doc`, `list_docs`, `delete_doc`
- `fe/vite.config.ts`: `/api/docs` proxied to be/chat.py
- `be/rag_docs_test.py` (new): 6 integration tests on auction_test with Gemini stubbed

## Notes

- Embedding runs before the database write, so a Gemini failure leaves no rows.
- No production route for /api/docs, same as /api/chat (only the Vite dev proxy).
