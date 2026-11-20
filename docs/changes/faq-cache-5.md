# faq-cache-5 - Internal FAQ match endpoint for the chat bot

SRS: system - caching FAQ with redis, Req-1 (backend side), Req-3 (the RAG pipeline keeps working).

## Changed files

| File | Change |
|---|---|
| be/src/routes/rag.ts | New `GET /api/rag/faq-match?q=` behind `requireInternal` (X-Internal-Token). Normalizes `q` (`normalizeQuestion`), reads `faq:q:<sha256(normalized)>` from Redis; on a miss looks up `faqs.normalized_question` among live rows and caches the result: a match for `FAQ_CACHE_TTL_SECONDS`, a "no match" for 300 s. 200 `{faqId, question, answer}`, 404 no match, 400 empty/blank/missing or over 4000 chars, 401 bad token. `X-Cache: HIT|MISS`. |
| be/src/routes/faqs.ts | `FAQ_MATCH_PREFIX` exported (added with faq-cache-4's `clearFaqCache`, which deletes every `faq:q:` key on any FAQ write, so remembered misses never hide a new FAQ). |
| e2e/integration/faq-cache-5-match.test.ts | New: exact and loosely written question match, second call HIT; miss 404 and remembered; a new FAQ matches right after a remembered miss; edited answer returned at once; deleted FAQ 404; 400 and 401 cases. |

## Notes

- Exact match on the normalized question only. Anything else goes to the RAG pipeline (faq-cache-6).
- Flask never sees Redis; it calls this route through `call_api` like every other `/api/rag` route.
