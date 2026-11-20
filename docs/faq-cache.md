# FAQ cache with Redis (round 19)

Round 19 (faq-cache-1 .. 8). The FAQ lives in Postgres (`faqs`, seeded from `faq.txt`) and is served through
`/api/faqs`, cache-aside from Redis. The chat bot answers an FAQ question straight from the cache and reuses its own
earlier answers to guests, but every other question goes through the RAG pipeline exactly as before
([rag.md](rag.md)). Only the Node API talks to Redis. Flask (`be/rag`) reaches it through `/api/rag`, like every
other piece of data.

**Redis is never needed for a correct answer.** When it is down or still connecting, every cache read is a miss and
every write is skipped (`be/src/lib/cache.ts`, fail-open, at most one error log until it is back). Reads then come
from Postgres and the chat falls back to RAG.

```
browser ──GET /api/faqs──────────────▶ Node ──▶ Redis faq:list / faq:item:<id> ──miss──▶ Postgres faqs
browser ──POST /api/chat──▶ Flask ──1. GET /api/rag/faq-match────▶ Node ──▶ Redis faq:q:<sha256> ──miss──▶ Postgres
                                  ──2. GET /api/rag/answer-cache─▶ Node ──▶ Redis rag:ans:<ver>:<sha256>  (guests, opening question)
                                  ──3. retrieve + Gemini (RAG) ──▶ PUT /api/rag/answer-cache when step 2 ran
```

## Setup

- `docker compose up -d --wait db redis` (also what `npm run db:up` does). The container is `auction_redis`, on host
  port 6380.
- `REDIS_URL` (be/.env) defaults to `redis://127.0.0.1:6380/0`. Tests use database 1 (vitest and the Python full-path
  test), Playwright's API uses database 2, and the dev server uses 0.
- `npm run db:seed -w be` adds the `faq.txt` questions to a dev database. The seed only adds questions that are
  missing, so a staff edit or delete is never undone.

## Settings

| Env | Default | What |
|---|---|---|
| `REDIS_URL` | `redis://127.0.0.1:6380/0` | Redis connection |
| `FAQ_CACHE_TTL_SECONDS` | 3600 | life of `faq:list`, `faq:item:<id>` and a matched `faq:q:<hash>` |
| `RAG_ANSWER_TTL_SECONDS` | 86400 | life of a cached bot answer `rag:ans:<ver>:<hash>` |

## Keys

Every key is stored under the prefix `auction:` (e.g. `auction:faq:list`).

| Key | Value | TTL | Cleared by |
|---|---|---|---|
| `faq:list` | the `GET /api/faqs` body | `FAQ_CACHE_TTL_SECONDS` | any FAQ write |
| `faq:item:<id>` | one FAQ | `FAQ_CACHE_TTL_SECONDS` | a write to that FAQ |
| `faq:q:<sha256(normalized question)>` | `{faqId, question, answer}`, or `{none: true}` for "not an FAQ" | match: `FAQ_CACHE_TTL_SECONDS`; no match: 300 s | any FAQ write (all `faq:q:` keys) |
| `rag:ver` | the knowledge version (random) | 30 days | replaced on document upload/delete and on any FAQ write |
| `rag:ans:<ver>:<sha256(normalized question)>` | `{reply, sources}` | `RAG_ANSWER_TTL_SECONDS` | stops matching when `rag:ver` changes |

"Normalized" means `normalizeQuestion` in `be/src/lib/faqs.ts`: lower case, single spaces, no trailing `? ! .`.
So "How do I add credit?" and "  how DO i add credit " are the same question.

## Routes

| Route | Needs | What |
|---|---|---|
| `GET /api/faqs` | nothing (guests too) | live FAQs grouped by category, in faq.txt order; header `X-Cache: HIT` or `MISS` |
| `GET /api/faqs/:id` | nothing | one live FAQ; 404 for unknown or deleted |
| `POST /api/faqs` | `knowledge.manage` (staff, admin) | add `{category, question, answer, sortOrder?}`; 409 if the normalized question exists |
| `PUT /api/faqs/:id` | `knowledge.manage` | replace the fields of a live FAQ; 404 deleted, 409 duplicate |
| `DELETE /api/faqs/:id` | `knowledge.manage` | soft delete (sets `deleted_at`), 204 |
| `GET /api/rag/faq-match` | internal token | `?q=` the FAQ whose normalized question equals q, or 404 |
| `GET /api/rag/answer-cache` | internal token | `?q=` returns `{version, answer}`; answer is null on a miss |
| `PUT /api/rag/answer-cache` | internal token | `{question, version, reply, sources}` stores the answer, or 409 if the version is no longer current |

Bodies are checked with zod (400): category 1-100, question 1-500, answer 1-10000 characters; chat questions up to
4000 characters.

## How the chat bot answers (be/rag/chat.py)

Order inside `POST /api/chat`, after the prompt-injection middleware, the message check, the visitor lookup and the
rate limit (all unchanged):

1. **FAQ** (`functions/faq_answer.py`). If the last message is an FAQ question, the FAQ answer is returned with
   `sources: ["FAQ"]`. The turn is logged as `answered` with model `faq-cache`, and there is no embedding and no
   Gemini call. This is for everyone, guests and signed-in visitors alike.
2. **Cached answer** (`functions/cached_answer.py`). Only for a guest's opening question, i.e. a conversation of one
   message. A hit is returned and logged with model `rag-cache`.
3. **RAG**: retrieve, then Gemini, then the guard, as before. If step 2 ran and the reply passed the guard, it is
   stored (`functions/store_answer.py`) under the version step 2 returned. If a document or FAQ changed during the
   Gemini call, Node answers 409 and the answer is not cached.

Signed-in visitors never use step 2, because their prompt contains their own bids, lots and credit. Follow-up
questions never use it either, because their answer depends on the earlier messages. If any lookup fails, the bot
moves on to the next step; the cache can never cost the visitor an answer.

## Known limits

- An FAQ matches only when the question is the same after normalizing. Rephrased questions go to RAG, which can
  still find FAQ-like text in uploaded documents.
- A write landing between a cache miss's Postgres read and its Redis write can leave the old FAQ text cached until
  the TTL ends (`shortcut:` in `be/src/routes/faqs.ts`).
- If Redis is down while a document changes, that version bump is lost. Answers cached before the outage can then
  be served until their TTL ends (`shortcut:` in `be/src/lib/ragAnswerCache.ts`).
- There is no FAQ admin page; staff use the API.

Change notes: [faq-cache-1](changes/faq-cache-1.md) .. [faq-cache-8](changes/faq-cache-8.md).
