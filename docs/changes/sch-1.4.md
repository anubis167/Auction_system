# sch-1.4 Conversation tables and customer conversation API

Includes the tables from the deferred sch-1.2 (folded in at the user's request, 2026-11-15).

## Tables (migration `20261115090000_chat_conversations`)

- `chat_conversations`: customer, `status` waiting | assigned | closed, `handoff_reason` limit | unavailable,
  assigned staff, created/assigned/closed times, `deleted_at` (soft delete). Indexes (status, created_at), (customer_id).
- `chat_messages`: conversation, `sender` customer | bot | staff, `sender_id` (null for bot), `text` <= 1000,
  `deleted_at`. Index (conversation_id, created_at).

The migration SQL was produced with `prisma migrate diff` (old schema -> new), not `migrate dev`, so the main
repo's dev database (shared container, see claude-progress.md) is not touched. Run `npx prisma migrate deploy -w be`
before starting the app from this worktree.

## API (`/api/support`, signed-in customers only: guests 401, staff/admin 403)

Mounted at `/api/support`, not `/api/chat/...`: the Vite dev proxy sends every `/api/chat*` path to the Python bot.

| Route | Notes |
|---|---|
| `POST /conversations` `{reason, transcript[]}` | After a bot handoff (sch-1.3). `transcript` = the bot chat so far, 1-20 lines of `{role: user\|model, text <= 1000}`. Opens a `waiting` conversation (201) or appends to the customer's open one (200). The customer's user row is locked (`FOR UPDATE`) so two handoffs at once open one conversation. |
| `GET /conversations/mine` | The open (waiting/assigned, not deleted) conversation with its non-deleted messages, oldest first, or `null`. |
| `POST /conversations/:id/messages` `{text 1-1000}` | Owner only; someone else's, missing or deleted -> 404; closed -> 409. |

## Changed files

- `be/prisma/schema.prisma`, `be/prisma/migrations/20261115090000_chat_conversations/migration.sql`
- `be/src/routes/support.ts` (new), `be/src/app.ts` (mount)
- Test: `e2e/integration/sch-1-4-customer-chat.test.ts` (7 tests: access, validation, open/reuse, concurrent handoff, mine, messages, soft delete)
