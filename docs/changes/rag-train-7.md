# rag-train-7 Export approved examples for training

| File | Change |
|---|---|
| be/src/lib/ragExport.ts | New: `toTrainingRecord()` builds `{question, chunks (texts by rank), reply, idealReply, label}` field by field, so no user id, visitor hash, email, name or reviewer can leak; `toJsonl()`. |
| be/src/routes/rag.ts | `GET /api/rag/examples/export` (rag.review): marks every approved example of a live turn `exported` with one `exported_at`, then reads exactly those rows and sends them as `rag-examples-YYYY-MM-DD.jsonl` (`application/x-ndjson`). Claiming before reading means two exports at once never share an example; a second run is empty. |
| fe/src/pages/AdminRagReview.tsx | "Download approved examples (JSONL)" link on /admin/rag-review. |
| e2e/unit/rag-train-7-export.test.ts | New: field stripping, JSONL format. |
| e2e/integration/rag-train-7-export.test.ts | New: 401/403, approved only, no personal data, rows marked exported, second run empty, concurrent exports. |
| e2e/rag-train-7-export.spec.ts | New: download from the page, file content, db marked exported, not exported twice. |
