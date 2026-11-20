# RAG training log

The chat bot (be/rag) saves its conversations so staff can review them and export good examples to train the bot.
Flask never opens the database: every write goes through the Node API under `/api/rag` with `X-Internal-Token`.

## What is stored

| Table | One row per | Stored |
|---|---|---|
| rag_sessions | chat-box conversation and user | `user_id` (null for guests), `visitor_hash` = sha256 of the chat box's random visitor token (the raw token is never stored), `logging_consent`, `started_at` |
| rag_turns | question + answer | the visitor's question, the bot's reply, `outcome` (answered / refused / handed_off / error), `guard_triggered` (prompt_injection / prompt_leak / secrets), `feedback` (up / down), `model`, `prompt_version` (sha256 of prompts/system.md), token counts, latency |
| rag_retrievals | knowledge chunk returned for a turn | chunk, rank, score, `cited` (the reply contains the excerpt's `[title]`) |
| rag_examples | reviewed turn | status, label, ideal reply, reviewer |

The visitor token is made by the chat box (fe/src/chatHistory.ts, 32 random bytes per conversation) and kept in the browser with the conversation.

## Notice and opt-out

The chat box shows "Chats are saved to improve our bot." with a link to /privacy#chat and a "Don't save my chats" checkbox
(kept in localStorage `beat_em_chat_logging_opt_out`). When it is ticked the chat box sends `logging: false`; Flask then sends
only `{visitor, logging: false}` to `POST /api/rag/turns` (never the text), and Node sets the session's
`logging_consent` to false and writes no turn. Unticking it sets consent back to true and turns are saved again.
