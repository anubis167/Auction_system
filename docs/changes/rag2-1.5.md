# rag2-1.5: /api/docs upload, list and delete through the API

Same URLs (Vite already proxies `/api/docs` to Flask), same answers.

- `POST /api/docs`: `session_user` first (401 guest, 403 customer) so no Gemini call is spent on someone who cannot
  upload; `functions/read_upload.py` checks .txt/.md, 2 MB and UTF-8; chunk + embed (503 when Gemini fails);
  then `POST /api/rag/documents` with the visitor's cookie and the internal token. Node checks `knowledge.manage`
  again and stores everything in one transaction. Node's 400/403/413 are passed on; a 401 there means this
  service's token was refused, so it is a 502 like any other API failure.
- `GET /api/docs`, `DELETE /api/docs/<id>`: forwarded to Node with the cookie; Node's 401/403/404 passed on.
- Removed: `be/rag/rag_db_test.py`, `rag_docs_test.py`, `rag_chat_test.py`, `rag_user_test.py`, `chat_test.py`
  (they wrote to Postgres directly). Their cases are in rag2_1_4 / rag2_1_5 (faked API) and rag2_1_6 (real API);
  the table tests are covered by e2e/integration/rag2-1-1-rag-api.test.ts. JWT forgery cases (wrong secret,
  expired, alg none) are now Node's job, covered by be/tests auth suites and rag2-1.6's forged cookie.

## Tests
- `e2e/py/rag2_1_5_docs_test.py`: upload body (cookie + token, chunks with vectors in order), title default,
  auth before Gemini, Node's 403 passed on, service-token 401 -> 502, API failures 502, bad files, embedding
  failure sends nothing, list newest first, soft delete, 404s.
