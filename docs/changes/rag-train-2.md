# rag-train-2 Record each chat turn

Every /api/chat turn (answered, refused, handed off, failed) is saved to rag_turns through the Node API. Flask still never opens the database.

| File | Change |
|---|---|
| be/src/routes/rag.ts | `POST /api/rag/turns` (X-Internal-Token + the visitor's forwarded cookie): finds or creates the rag_sessions row for (sha256 of the visitor token, user), numbers the turn, saves it. `visitorHash()` exported. |
| be/rag/functions/log_turn.py | New: sends the turn with `promptVersion` = sha256 of prompts/system.md. Returns the turn id or None; never raises. |
| be/rag/functions/guard_reason.py | New: which reply guard fired (`prompt_leak`, `secrets`); moved out of guard_reply.py, which now uses it. |
| be/rag/chat.py | `web_chat` logs every exit (limit / Gemini failure: `handed_off` for customers, `error` otherwise; guard: `refused`), adds `turnId` to the reply when saved. `log_refused_chat` (after_request) logs prompt injection that security.py refused as `refused` / `prompt_injection`. |
| fe/src/chatHistory.ts | Each conversation gets a random 64-hex `token` (also back-filled on old saved conversations). |
| fe/src/components/ChatBox.tsx | Sends `visitor: token` with each /api/chat call. |
| e2e/integration/rag-train-2-turns.test.ts | New: guest vs customer user_id, hash only, turn numbering, refused turn, token and body checks. |
| e2e/py/rag_train_2_log_turn_test.py, e2e/py/fake_api.py | New Python cases (outcomes, guard names, metadata, logging failure keeps the answer, no token = no write); FakeApi gains /api/rag/turns. |
| e2e/py/rag2_1_6_full_path_test.py | Turns written through the real Node API. |
| e2e/rag-train-2-turn-log.spec.ts, e2e/rag-db.ts | New: full stack write as guest and as alice; the chat box sends one token per conversation. |

Not logged: a request without a visitor token (nothing to group it under), and invalid bodies (400 before any turn exists).
