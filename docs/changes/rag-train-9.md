# rag-train-9 Document the training log

| File | Change |
|---|---|
| docs/rag-training-log.md | Completed: data flow, every table, Node and Python routes, the `rag.review` permission, review and export steps, privacy rules, retention, tests, known limits. |
| docs/rag.md | Links to it; function list and Node route table updated (chunk ids, training routes). |
| e2e/unit/rag-train-9-docs.test.ts | New: every Node route in the doc's table exists in be/src/routes/rag.ts; tables, migrations (files exist), permission, retention setting named; docs/rag.md links to the doc. |
| e2e/rag-db.ts | Specs connect to 127.0.0.1 instead of localhost (localhost hit P1001 mid-suite through Docker Desktop). |
