# faq-cache-3 - Public FAQ read API served from Redis

SRS: system - caching FAQ with redis, Req-2 (FAQ API handle).

## Changed files

| File | Change |
|---|---|
| be/src/routes/faqs.ts | New: `GET /api/faqs` (live FAQs grouped by category, categories in the order of their first question, i.e. faq.txt A..H) and `GET /api/faqs/:id` (one live FAQ, 404 for unknown, bad or deleted ids). Cache-aside: Redis key `faq:list` / `faq:item:<id>`, else Postgres, then stored for `FAQ_CACHE_TTL_SECONDS`. Header `X-Cache: HIT` or `MISS`. No sign-in needed. Exports `FAQ_LIST_KEY`, `faqItemKey`, `faqView` for faq-cache-4. |
| be/src/app.ts | Mounts `/api/faqs`. |
| be/src/config.ts | `faqCacheTtlSeconds` (env `FAQ_CACHE_TTL_SECONDS`, default 3600; bad values fall back to it). |
| be/.env.example | `FAQ_CACHE_TTL_SECONDS`. |
| be/src/lib/cache.ts | `close()` drops a client that never connected instead of waiting on `quit()` (it hung in tests). |
| e2e/integration/faq-cache-3-read.test.ts | New: list MISS then HIT with an equal body, 8 categories in order, 38 FAQs, no internal fields; item MISS/HIT; 404s; deleted FAQ hidden; with Redis down both routes still answer from Postgres (always MISS). |

## Response shape

```json
{ "categories": [ { "category": "General", "faqs": [ { "id": 1, "category": "General", "question": "...", "answer": "...", "sortOrder": 1, "updatedAt": "2026-11-20T..." } ] } ] }
```

## Notes

- A write between a cache miss's Postgres read and its Redis write can leave the old text cached until the TTL ends (marked `shortcut:` in faqs.ts). faq-cache-4 clears the keys after every write, which makes this window tiny.
- Smoke on a real server (port 4200, Redis db 3): MISS, HIT, TTL 3600.
