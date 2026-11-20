# faq-cache-2 - faqs table, seeded from faq.txt

SRS: system - caching FAQ with redis, Req-2 (FAQ API handle).

## Changed files

| File | Change |
|---|---|
| be/prisma/schema.prisma | New model `Faq` (`faqs`): category, question, answer, normalized_question, sort_order, created_by_id / updated_by_id (null for seeded rows), created_at, updated_at, deleted_at (soft delete). Back-relations `faqsCreated` / `faqsUpdated` on User. |
| be/prisma/migrations/20261121090000_faq_cache/migration.sql | Creates `faqs` and a partial unique index `faqs_normalized_question_live_key` (unique among rows with deleted_at null), written by hand because Prisma 5 cannot declare it. `prisma migrate diff` ignores it (no drift). |
| be/src/lib/faqs.ts | New: `normalizeQuestion` (lower case, single spaces, no trailing `? ! .`) and `parseFaqText` (`### Qn.` blocks under `# X. CATEGORY` headings; category becomes sentence case, e.g. "Account and security"). |
| be/prisma/seed.ts | `seedFaqs()` (called by `seed()`): inserts faq.txt questions whose normalized form is not in the table yet, deleted rows included, so a staff edit or delete is never undone. One read and one `createMany`. |
| e2e/unit/faq-cache-2-parse.test.ts | New: 38 entries in order, Q1/Q5/Q38 content, section I notes skipped, CRLF, normalize cases. |
| e2e/integration/faq-cache-2-table.test.ts | New: seed stores 38; reseed adds nothing and keeps edits; duplicate live question -> P2002; soft-deleted row frees its question and is not re-seeded. |

## Notes

- faq.txt section I (knowledge-base notes for the RAG bot) has no `### Qn.` blocks and is not stored.
- `TRUNCATE users CASCADE` (tests' `resetDb`) also empties `faqs`; the seed it runs refills them.
- Dev database: `npm run db:seed -w be` adds the FAQ rows.
