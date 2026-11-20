# faq-cache-8 - FAQ cache documentation and the round gate

SRS: system - caching FAQ with redis, Req-1, Req-2, Req-3.

## Changed files

| File | Change |
|---|---|
| docs/faq-cache.md | New topic doc covering Redis setup, settings, every key with its TTL and what clears it, the FAQ and cache routes with their permissions, the order the chat bot uses (FAQ, then cached answer, then RAG), and known limits. |
| docs/rag.md | Links faq-cache.md; adds the three new functions and the internal routes. |
| e2e/unit/faq-cache-8-docs.test.ts | New: the routes table matches the code exactly, in both directions (8 routes). Every setting is in config.ts and .env.example, every key prefix is used in code, the three chat functions exist, all eight change notes exist, and docs/rag.md links the doc. |
