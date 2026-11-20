# RAG training log

Round 18 (rag-train-1 .. 9). The chat bot (be/rag) saves its conversations so staff can review them and export good
examples to train the bot. Flask never opens the database: every write goes through the Node API under `/api/rag`
with `X-Internal-Token`. Service overview: [rag.md](rag.md).

```
chat box ──POST /api/chat {messages, visitor, logging?}──▶ Flask web_chat ──log_turn──▶ POST /api/rag/turns ──▶ rag_sessions / rag_turns / rag_retrievals
chat box ──POST /api/chat/feedback──▶ Flask chat_feedback ──▶ PUT /api/rag/turns/:id/feedback ──▶ rag_turns.feedback
staff    ──/admin/rag-review──▶ GET /api/rag/review, POST /api/rag/review/:id ──▶ rag_examples
staff    ──Download link──▶ GET /api/rag/examples/export ──▶ JSONL file, rag_examples.status = exported
scheduler ──rag-retention job──▶ rag_turns.deleted_at
```

## Tables

| Table | One row per | Stored |
|---|---|---|
| rag_sessions | chat-box conversation and user | `user_id` (null for guests), `visitor_hash` = sha256 of the chat box's random visitor token (the raw token is never stored), `logging_consent`, `started_at`, `deleted_at` |
| rag_turns | question + answer | `turn_index`, the visitor's question, the bot's reply, `outcome` (answered / refused / handed_off / error), `guard_triggered` (prompt_injection / prompt_leak / secrets), `feedback` (up / down), `model`, `prompt_version` (sha256 of prompts/system.md), token counts, latency, `deleted_at` |
| rag_retrievals | knowledge chunk returned for a turn | chunk, rank, score, `cited` (the reply contains the excerpt's `[title]`) |
| rag_examples | reviewed turn | `status` (raw / approved / rejected / exported), `label` (good / bad / needs_fix), `ideal_reply`, reviewer, `reviewed_at`, `exported_at` |

Migrations: `20261120090000_rag_training_log` (tables), `20261120100000_rag_logging_consent`, `20261120110000_rag_review_permission`.

## Node routes (be/src/routes/rag.ts)

| Route | Needs | Does |
|---|---|---|
| `POST /api/rag/turns` | internal token (+ the visitor's cookie, forwarded) | save one turn and its retrievals; `logging: false` saves only the session's consent |
| `PUT /api/rag/turns/:id/feedback` | internal token + the turn's visitor token | thumbs up / down; another visitor gets 403 |
| `GET /api/rag/review` | `rag.review` | newest 50 turns waiting for review (`?all=1`: reviewed ones too) |
| `POST /api/rag/review/:id` | `rag.review` | approve (label, better reply) or reject: one rag_examples row |
| `GET /api/rag/examples/export` | `rag.review` | approved examples as JSONL, then marked exported |
| `GET /api/rag/chunks` | internal token | now also returns each chunk's `id`, so turns can point at it |

The browser reaches `/api/rag/review` and `/api/rag/examples` straight on Node (fe/vite.config.ts); the rest of
`/api/rag` is proxied to be/rag.

## Python routes and functions (be/rag)

| Route / function | Does |
|---|---|
| `POST /api/chat` (`web_chat`) | logs every exit: answered, refused by a reply guard, handed off (customer) or error; adds `turnId` to the reply when saved |
| `log_refused_chat` (after_request) | logs `/api/chat` requests security.py refused as prompt injection (`refused`, `prompt_injection`) |
| `POST /api/chat/feedback` | checks `{turnId, feedback, visitor}` and relays it to Node |
| `functions/log_turn.py` | sends the turn; returns its id or None, never raises (a lost log line never costs the visitor their answer) |
| `functions/cited_chunks.py` | retrieved hits -> retrieval rows with `cited` |
| `functions/guard_reason.py` | which reply guard fired |

A request without a visitor token is not logged.

## Permission

`rag.review` ("Review saved chat bot answers and export training examples"): the admin role has it by default;
it can be granted to staff on /admin/permissions.

## Review and export

1. /admin/rag-review ("Bot review" in the staff/admin nav) lists turns with no review yet: question, reply, outcome,
   the visitor's thumbs and the excerpts used.
2. Pick a label (good / bad / needs fix), write a better reply if needed (required for needs fix), Approve or Reject.
   A reviewed turn leaves the list; a second review of it is refused (409).
3. "Download approved examples (JSONL)" saves `rag-examples-YYYY-MM-DD.jsonl`, one line per approved example:
   `{"question", "chunks" (texts by rank), "reply", "idealReply", "label"}`. Those examples become `exported` and
   are not in the next file.

## Privacy

- The chat box shows "Chats are saved to improve our bot." with a link to /privacy#chat and a "Don't save my chats"
  checkbox (kept in localStorage `beat_em_chat_logging_opt_out`). When ticked the chat box sends `logging: false`;
  Flask then sends only `{visitor, logging: false}` to Node (never the text), and Node sets the session's
  `logging_consent` to false and writes no turn. Unticking it sets consent back to true.
- Guests are known only by the hash of a random per-conversation token made in the browser
  (fe/src/chatHistory.ts, 32 random bytes).
- The export file never holds a user id, visitor hash, email, name or reviewer (be/src/lib/ragExport.ts builds each
  record field by field).
- All deletes are soft deletes.

## Retention

The `rag-retention` job (be/src/lib/ragRetention.ts) runs with the auction jobs, on `AUCTION_JOB_INTERVAL_MS`
(hourly by default). It soft-deletes turns older than `RAG_TURN_RETENTION_DAYS` (default 180) that have no
rag_examples row. Reviewed turns are kept. Soft-deleted turns are left out of the review queue and the export.

## Tests

| Feature | Tests |
|---|---|
| rag-train-1 tables | e2e/integration/rag-train-1-tables.test.ts |
| rag-train-2 turns | e2e/integration/rag-train-2-turns.test.ts, e2e/py/rag_train_2_log_turn_test.py, e2e/rag-train-2-turn-log.spec.ts |
| rag-train-3 retrievals | e2e/integration/rag-train-3-retrievals.test.ts, e2e/py/rag_train_3_citations_test.py, e2e/rag-train-3-retrievals.spec.ts |
| rag-train-4 feedback | e2e/integration/rag-train-4-feedback.test.ts, e2e/py/rag_train_4_feedback_test.py, e2e/rag-train-4-thumbs.spec.ts |
| rag-train-5 opt-out | e2e/integration/rag-train-5-consent.test.ts, e2e/py/rag_train_5_opt_out_test.py, e2e/rag-train-5-opt-out.spec.ts |
| rag-train-6 review | e2e/integration/rag-train-6-review.test.ts, e2e/rag-train-6-review.spec.ts |
| rag-train-7 export | e2e/unit/rag-train-7-export.test.ts, e2e/integration/rag-train-7-export.test.ts, e2e/rag-train-7-export.spec.ts |
| rag-train-8 retention | e2e/unit/rag-train-8-retention.test.ts, e2e/integration/rag-train-8-retention.test.ts |
| rag-train-9 this doc | e2e/unit/rag-train-9-docs.test.ts (every Node route in the table above exists in rag.ts) |

## Known limits

- shortcut: chunks of one document share its title, so citing `[title]` marks all of them cited.
- Turn numbers are counted per session; two turns written at the very same moment for one conversation would hit
  the unique key and that log line is dropped (the chat box sends one message at a time).
- The review queue shows the newest 50; there is no paging yet.
