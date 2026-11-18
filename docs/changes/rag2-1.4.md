# rag2-1.4: /api/chat rebuilt on the API

Same answers for the chat box; the data now comes only from Node.

- Who the visitor is: `functions/session_user.py` -> `GET /api/rag/me` with the visitor's own `auction_token`
  cookie. Node verifies the JWT, the user's status and reads their account; Python no longer has the JWT secret
  logic. No cookie = guest without a call; 401 = guest; any other failure or a malformed answer = guest, logged.
  Nothing in the request body can choose the user.
- Excerpts: `functions/retrieve.py` embeds the question, `GET /api/rag/chunks` with the internal token (the
  visitor's cookie is not sent), checks every row (title, text, numeric vector) and ranks them. Any failure =
  answer without excerpts.
- Limit (30/min) and handoff (sch-1.3) unchanged: when limited, no embedding and no Gemini call.
- `functions/guard_reply.py` (ecbot's prompt_leak / secrets guardrails): a reply that contains a prompt section tag
  (`<role>`, `<rules>`, `<security>`, `<format>`, `<account>`, `<excerpts>`, `<untrusted`), a JWT, a Google or
  `sk-` style key, a Bearer token or the internal token is replaced by a fixed apology.

## Tests
- `e2e/py/rag2_1_4_chat_test.py` (Node faked by `e2e/py/fake_api.py` at `requests.request`, so `call_api`'s checks
  run; Gemini stubbed): every case of round 12's chat_test, rag_chat_test, rag_user_test and of
  sch_1_3_handoff_test (removed; its 6 cases are the `Handoff` class), plus API failure shapes (500, non-JSON,
  wrong type, malformed chunk, redirect, connection refused) and the reply guard.
