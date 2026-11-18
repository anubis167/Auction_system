# rag2-1.1: Node /api/rag routes for the RAG service

Round 14 (SRS 'Rag architechture', Req-1): the Python chat service no longer reads the database. These routes are
the only data it may use.

| Route | Auth | Answer |
|---|---|---|
| `GET /api/rag/me` | visitor's session cookie (forwarded by Python) | `{id, role, username, credit {balance, held, available}, bids[5], lots[5]}`, money as `"12.50"` strings; guests 401 |
| `GET /api/rag/chunks` | `X-Internal-Token` only | `[{title, text, embedding}]` of live documents |
| `POST /api/rag/documents` | `X-Internal-Token` + cookie with `knowledge.manage` | 201 `{id, title, chunks}`; body validated with zod; document and chunks in one nested create |
| `GET /api/rag/documents` | cookie with `knowledge.manage` | `{documents: [...]}` newest first |
| `DELETE /api/rag/documents/:id` | cookie with `knowledge.manage` | 204; soft delete (`deleted_at`), 404 when already gone |

- Internal token: `RAG_INTERNAL_TOKEN` (be/.env, read on every request through `config.ragInternalToken`), compared
  with `crypto.timingSafeEqual`. Unset = 503, wrong or missing = 401. A staff cookie alone never reaches the
  service-only routes.
- `POST /api/rag/documents` carries every chunk's embedding (~15 KB each), so `be/src/app.ts` checks the internal
  token first and then parses that one route with a 40 MB JSON limit, before the global 100 KB parser. A caller
  without the token never gets a large body read.
- New permission `knowledge.manage` for staff and admin (migration `20261118100000_knowledge_manage_permission`,
  `be/src/lib/permissions.ts`); admins can revoke it on the permissions page like any other.

## Files
- `be/src/routes/rag.ts` (new), `be/src/app.ts` (mount at `/api/rag`), `be/src/config.ts` (`ragInternalToken`)
- `be/src/lib/permissions.ts`, `be/prisma/migrations/20261118100000_knowledge_manage_permission/migration.sql`
- `be/tests/sec.permissions.test.ts`: staff's expected permission list now includes `knowledge.manage`
- `e2e/integration/rag2-1-1-rag-api.test.ts` (new, 5 tests)
