# faq-cache-7 - Cache RAG answers to repeated guest questions

SRS: system - caching FAQ with redis, Req-1 (backend side), Req-3 (the RAG pipeline keeps working).

## Changed files

| File | Change |
|---|---|
| be/src/lib/ragAnswerCache.ts | New: `answerKey(version, question)` = `rag:ans:<version>:<sha256(normalized question)>`, `knowledgeVersion()` (Redis `rag:ver`, `'0'` when unset), `bumpKnowledgeVersion()` (a new random value, 30-day TTL). |
| be/src/routes/rag.ts | New internal routes. `GET /api/rag/answer-cache?q=` returns `{version, answer}` (`answer` is `{reply, sources}` or null). `PUT /api/rag/answer-cache` `{question, version, reply, sources}` stores the answer for `RAG_ANSWER_TTL_SECONDS` (204), or answers 409 when `version` is no longer current. Uploading (`POST /documents`) and soft-deleting (`DELETE /documents/:id`) a document bump the version. |
| be/src/routes/faqs.ts | `clearFaqCache` also bumps the version, so any FAQ write drops cached bot answers. |
| be/src/config.ts, be/.env.example | `ragAnswerTtlSeconds` (env `RAG_ANSWER_TTL_SECONDS`, default 86400). |
| be/rag/functions/cached_answer.py | New: `cached_answer(question)` returns `{version, answer}`, or None on any failure. A malformed answer counts as a miss. |
| be/rag/functions/store_answer.py | New: `store_answer(question, version, reply, sources)` returns True when cached. Never raises; 409 is silent. |
| be/rag/chat.py | After the FAQ check, a guest (no session user) asking an opening question (one message) first tries `cached_answer`. A hit is returned without retrieval or Gemini and logged as `answered` with model `rag-cache` (`RAG_CACHE_MODEL`). On a miss the normal RAG path runs, and an unguarded answer is stored with the version from the lookup. The JSON building moved into a small `_answer()` helper used by all three success paths. |
| e2e/py/fake_api.py | An opt-in fake `answer-cache` route (`FakeApi.answers = {}`; `version` can be changed to simulate a knowledge change). |
| e2e/integration/faq-cache-7-answer-cache.test.ts | New: miss gives the version, PUT then GET hit (loose spelling too); document upload and delete drop answers; an FAQ edit drops answers; a stale-version PUT gets 409 and caches nothing; 400 and 401 cases. |
| e2e/py/faq_cache_7_answer_cache_test.py | New (8 tests): a second identical guest question skips Gemini and embedding and is logged as `rag-cache`; a signed-in visitor never uses the cache; follow-up questions are never cached; a guarded reply is not stored; a knowledge change during the Gemini call leaves nothing cached; cache down still gives a normal RAG answer; an FAQ match wins over the cache; `cached_answer` edge cases. |

## Rules

- **Guests only.** A signed-in visitor's prompt contains their bids, lots and credit (`build_prompt._account`), so their answers are never stored or served from the cache.
- **Opening questions only.** Gemini sees the whole conversation, so the answer to a follow-up depends on the earlier messages, while the cache key only covers the last one.
- **Only clean answers.** A turn with a guard reason, an error or a handoff is never cached.

## Notes

- The feature list said "one function file". It is two (`cached_answer.py`, `store_answer.py`), following be/rag's one-public-function-per-file rule.
- If Redis is down when a document changes, that version bump is lost. Answers cached before the outage can then be served until their TTL runs out (marked `shortcut:` in ragAnswerCache.ts).
