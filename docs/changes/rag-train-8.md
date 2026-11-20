# rag-train-8 Soft-delete old unreviewed turns

| File | Change |
|---|---|
| be/src/config.ts, be/.env.example | `RAG_TURN_RETENTION_DAYS` (default 180; zero, negative or non-numbers fall back to 180). |
| be/src/lib/ragRetention.ts | New: `retentionCutoff(now, days)`; `softDeleteOldTurns()` sets `deleted_at` on turns created before the cutoff that have no rag_examples row (reviewed turns, and turns with a raw example row, are kept). |
| be/src/lib/scheduler.ts | Job `rag-retention` runs with the auction jobs, on the same `AUCTION_JOB_INTERVAL_MS` setting (hourly by default). |
| e2e/unit/rag-train-8-retention.test.ts | New: cutoff date, setting default and bad values, job registered. |
| e2e/integration/rag-train-8-retention.test.ts | New: one run deletes only the old unreviewed turn, a second run nothing; deleted turns are not in the review queue (even `?all=1`) or the export. |

The review queue and the export already skip soft-deleted turns (rag-train-6/7).
