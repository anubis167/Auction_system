# faq-cache-4 - Staff manage FAQs; every change refreshes the cache

SRS: system - caching FAQ with redis, Req-2 (FAQ API handle).

## Changed files

| File | Change |
|---|---|
| be/src/routes/faqs.ts | New `POST /api/faqs` (201; goes last unless `sortOrder` is given), `PUT /api/faqs/:id` (full replace of category, question, answer, optional sortOrder), `DELETE /api/faqs/:id` (soft delete, 204). All behind `knowledge.manage` (staff + admin): guests 401, customers 403. zod body: category 1-100, question 1-500, answer 1-10000 chars (trimmed), sortOrder integer >= 0. A question equal to a live FAQ's after `normalizeQuestion` is 409. A deleted FAQ cannot be edited or deleted again (404). created_by_id / updated_by_id record who wrote it. `clearFaqCache(id)` runs after each write: deletes `faq:list`, `faq:item:<id>` and every `faq:q:*` key (the chat bot's matches, faq-cache-5). |
| e2e/integration/faq-cache-4-write.test.ts | New: create listed at once (MISS then HIT, sortOrder 39, created by staff); edit visible in list and item; soft delete keeps the row and hides it everywhere; `faq:q:*` cleared, other keys kept; 401/403 change nothing; 409 for a normalized duplicate on create and edit; 400 for invalid bodies. |

## Notes

- Uses the existing `knowledge.manage` permission rather than a new `faq.manage`: the same people already manage what the bot answers from.
- No UI in this round (SRS Req-1: backend side). Staff call the API directly.
