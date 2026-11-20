# rag-train-6 Staff review queue for saved turns

| File | Change |
|---|---|
| be/prisma/migrations/20261120110000_rag_review_permission, be/src/lib/permissions.ts | New permission `rag.review`; the admin role gets it (migration + seed DEFAULT_GRANTS). Staff can be granted it on /admin/permissions. |
| be/src/routes/rag.ts | `GET /api/rag/review` (newest 50 waiting turns: no rag_examples row or one still `raw`; `?all=1` also lists reviewed ones; soft-deleted turns never) with feedback, outcome, guard and the retrieved chunks. `POST /api/rag/review/:id` `{decision: approve/reject, label, idealReply}`: approve needs a label, `needs_fix` needs a better reply; writes one rag_examples row (`approved` / `rejected`, reviewer, date); 409 if already reviewed, 404 for unknown/deleted turns. |
| fe/vite.config.ts | `/api/rag/review` and `/api/rag/examples` go to the Node API (the rest of `/api/rag` is be/rag). |
| fe/src/pages/AdminRagReview.tsx, fe/src/App.tsx, fe/src/components/Layout.tsx, fe/src/styles.css | New /admin/rag-review "Bot review" page (rag.review): one card per turn with label, better reply, Approve / Reject; nav link "Bot review". |
| e2e/integration/rag-train-6-review.test.ts | New: 401/403 (customer, staff without grant), list contents and order, approve/reject, reviewed turns leave the list, raw example rows still wait, 409/400/404. |
| e2e/rag-train-6-review.spec.ts | New: admin approves (needs_fix + better reply) and rejects in the UI, rows checked in the db, reviewed turns gone after reload, customer 403. |
