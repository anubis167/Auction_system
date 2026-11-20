# RAG chat service (be/rag)

Round 14 (rag2-1.1 .. 1.6). The Flask service in `be/rag` answers the site's chat box (`POST /api/chat`), keeps the
document library the bot answers from (`/api/docs`) and the Facebook webhook. It never opens the database: every
read and write is a call to the Node API under `/api/rag`, and every answer is checked before it is used.
Design reference: ecbot's `apps/ai` (be/rag/ecbot, not used at runtime).

```
browser ──/api/chat, /api/docs──▶ Flask (be/rag/chat.py) ──call_api──▶ Node /api/rag/* ──▶ Postgres
              (Vite proxy)              │                  cookie and/or X-Internal-Token
                                        └──▶ Gemini (embeddings, answers)
```

## Layout

| Path | What |
|---|---|
| `be/rag/chat.py` | Flask routes only; each step calls one function |
| `be/rag/functions/<name>.py` | One public function per file, named after the file (checked by a test) |
| `be/rag/prompts/system.md` | The system prompt: `<role>`, `<rules>`, `<security>`, `<format>` |
| `be/rag/prompts/account.md`, `guest.md`, `excerpts.md` | Blocks added per call by `build_prompt` |
| `be/src/routes/rag.ts` | The Node side (`/api/rag`) |

Functions: `call_api` (the only data access), `session_user`, `retrieve` (embed + `rank`), `chunk_text`, `embed`,
`check_messages`, `over_limit`, `handoff_or_error`, `read_upload`, `load_prompt`, `build_prompt`, `guard_reply`.
To add a step, add a file in `functions/` with one public function and call it from a route.

## Node routes

| Route | Needs | Used for |
|---|---|---|
| `GET /api/rag/me` | visitor's cookie | who is asking, and their own credit, latest bids, open lots |
| `GET /api/rag/chunks` | internal token | all live chunks + embeddings, ranked in Python |
| `POST /api/rag/documents` | internal token + cookie with `knowledge.manage` | store an upload and its chunks |
| `GET /api/rag/documents`, `DELETE /api/rag/documents/:id` | cookie with `knowledge.manage` | list, soft delete |

## Security

- Only Node decides who the visitor is (the forwarded `auction_token` cookie). Python holds no JWT secret and no
  database password; the body of a chat request can never pick a user.
- `RAG_INTERNAL_TOKEN` guards the service-only routes (constant-time compare; unset = 503). `call_api` only
  talks to `/api/rag/*`, never follows redirects and sends the token or cookie only when a call needs it.
- Document text, titles, usernames and lot names enter the prompt inside `<untrusted>` with `<` `>` neutralised.
- `guard_reply` replaces a reply that copies the prompt's section tags or contains a JWT, key or the internal token.
- Uploads: staff/admin only (`knowledge.manage`, revocable by an admin), .txt/.md, 2 MB, UTF-8.

## Run

1. `be/.env` (shared by Node and Flask): `GEMINI_API_KEY`, `NGROK_AUTHTOKEN`, `RAG_INTERNAL_TOKEN` (any long random
   string, e.g. `python -c "import secrets; print(secrets.token_urlsafe(32))"`), optional `RAG_API_URL`
   (default `http://localhost:4000`).
2. `python -m pip install -r be/rag/requirements.txt`
3. `npm run dev` (Node + site), then `python be/rag/chat.py` (port 5000; Vite proxies `/api/chat` and `/api/docs`).
4. Upload as staff: `curl -b auction_token=<staff cookie> -F file=@doc.md -F title=Fees http://localhost:5173/api/docs`

## Tests

`npm run test:py` (part of `npm test`, so of `./init.sh`) runs `e2e/py/*_test.py`:
- `rag2_1_2_*`: call_api against a stub HTTP server, chunking, embedding retries, ranking, layout rules.
- `rag2_1_3_prompt_test.py`: prompt files and safe filling.
- `rag2_1_4_chat_test.py`, `rag2_1_5_docs_test.py`: Flask routes with Node faked by `e2e/py/fake_api.py`.
- `rag2_1_6_full_path_test.py`: starts the real Node API on port 4210 against `auction_test` (seeded first) and
  runs upload -> ask -> delete through Flask with only Gemini stubbed.

Node side: `e2e/integration/rag2-1-1-rag-api.test.ts` (vitest, in `npm test -w be`).

## Known limits

- shortcut: every question loads every live chunk from Node and scores it in Python; move ranking to pgvector in
  Node past a few thousand chunks.
- shortcut: the 30 calls/min limit is one in-memory counter for all visitors.
- The Facebook `/webhook` route was left as it was (no data access, no system prompt, no signature check).

## Redis reply cache (chat-cache)

`be/rag/functions/chat_cache.py` caches the Gemini answer for `POST /api/chat` in Redis. The key is a sha256 of the
model, the full system instruction (visitor account and excerpts) and the conversation, so a repeat question from the
same visitor state skips Gemini; a guest never gets a signed-in visitor's answer.

- `REDIS_URL` (e.g. `redis://localhost:6379/0`) turns it on; unset means no cache.
- FAQ questions (`be/rag/faq_questions.json`, the 38 questions of the FAQ document; matched word for word, case and spaces ignored, single message only) are cached forever, keyed on the question, so every visitor gets the same answer.
- Dynamic questions expire after `CHAT_CACHE_TTL_SECONDS` (default 3600).
- Empty or failed Gemini replies are not cached. Redis errors are logged and the chat calls Gemini as before.
- `docker compose up -d redis` starts Redis on port 6379 (container `auction_redis`).
- Tests: `e2e/py/chat_cache_test.py` (in-memory stand-in). Live check: two identical questions give one Gemini call.
- Shortcut: the cache runs after retrieval, so each question still costs one embedding call. FAQ answers ignore the visitor's account, and a changed FAQ answer needs the key deleted in Redis (or a new question text).
