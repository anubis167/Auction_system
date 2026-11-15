# sch-1.3 Bot signals handoff

SRS (staff chat panel): "when Agent reach to limit ..., the message will come into chat panel of staff".
Off-topic detection is deferred by the user; only the limit and Gemini failures hand off.

## Behavior of `POST /api/chat`

| Case | Signed-in customer | Guest, staff, admin |
|---|---|---|
| Over the shared limit (`over_web_limit`, 30 calls/min) | `200 {"handoff": true, "reason": "limit"}` | `429` as before |
| Gemini fails after its retries, or answers empty | `200 {"handoff": true, "reason": "unavailable"}` | `503` as before |
| Normal answer | unchanged (`reply`, `sources`) | unchanged |

The browser (sch-1.7) reacts to `handoff` by opening a staff conversation.

The user still comes only from the verified `auction_token` cookie (rag-1.7). If the db lookup fails the
visitor is treated as a guest, so they get the old error rather than a handoff that could not be stored.

When the limit has tripped, the user is still looked up (one cheap query) but the question is not embedded,
so a limited request makes no Gemini call at all.

## Changed files

- `be/rag/chat.py`: `handoff_or_error()`; `web_chat` looks the user up before acting on the limit and
  skips account context and retrieval when limited.
- New test: `e2e/py/sch_1_3_handoff_test.py` (unit, Gemini and db stubbed): in-scope unchanged, limit, Gemini
  error, empty reply, guests keep 429/503, staff/admin keep 503, db down -> guest error.
- `be/rag/chat_test.py` unchanged (its requests have no cookie, so they are guests and keep 429/503).
