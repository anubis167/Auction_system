# rag-train-5 Logging notice and opt-out

| File | Change |
|---|---|
| be/prisma/schema.prisma, be/prisma/migrations/20261120100000_rag_logging_consent | `rag_sessions.logging_consent` boolean, default true. |
| be/src/routes/rag.ts | `POST /api/rag/turns` with `logging: false` takes only `{visitor}`: finds or creates the session, sets consent false, saves no turn, answers `{turnId: null}`. A normal write sets consent back to true. |
| be/rag/functions/log_turn.py, be/rag/chat.py | `consent` from the body's `logging` (only `false` opts out); opted-out turns send no text. |
| fe/src/chatHistory.ts | `loadLoggingOptOut` / `saveLoggingOptOut` (localStorage). |
| fe/src/components/ChatBox.tsx, fe/src/styles.css | Notice line with a Privacy link and the "Don't save my chats" checkbox (44 px tall label); sends `logging: false` when ticked. |
| fe/src/pages/Privacy.tsx, fe/src/App.tsx | New /privacy page (`#chat` section). |
| docs/rag-training-log.md | New: what is stored, the opt-out. |
| e2e/integration/rag-train-5-consent.test.ts, e2e/py/rag_train_5_opt_out_test.py, e2e/rag-train-5-opt-out.spec.ts, e2e/py/fake_api.py | Tests. |
