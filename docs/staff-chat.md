# Staff chat (round 13, sch-1.x)

The site's chat bot (be/rag/chat.py, Gemini) hands a **signed-in customer** to a human when it cannot answer:
it hit its rate limit, or Gemini failed. Staff answer many customers at once from **Customer chats** (`/staff/chats`).

## Flow

1. Customer asks the bot. `POST /api/chat` answers `{handoff: true, reason: limit|unavailable}` instead of 429/503
   (guests, staff and admins keep the errors). (sch-1.3)
2. The ChatBox posts the bot transcript to `POST /api/support/conversations` and switches to staff mode. (sch-1.4, sch-1.7)
3. The conversation appears in every staff panel's **Waiting** list, live. (sch-1.6, sch-1.8)
4. A staff member claims it (exactly one wins a race) and replies. A staff member can hold many conversations. (sch-1.5)
5. Messages flow both ways live; after a reload both sides are restored from the API.
6. Staff (or an admin) close it; the customer's box goes back to the bot.

## Statuses (`chat_conversations.status`)

| Status | Meaning |
|---|---|
| `waiting` | In the queue; any staff member may read and claim it. Customer messages reach the whole queue. |
| `assigned` | Claimed. Only the assigned staff member replies; messages go only to them and the customer. Admins can read it. |
| `closed` | Ended. No one can write; the customer can be handed off again later (a new conversation). |

Delete is a soft delete (admin, `deleted_at`): hidden everywhere, rows kept.

## Where things are

| Part | Code | Docs |
|---|---|---|
| Bot handoff | `be/rag/chat.py` (`handoff_or_error`) | docs/changes/sch-1.3.md |
| Tables | `be/prisma/schema.prisma` (`ChatConversation`, `ChatMessage`) | docs/changes/sch-1.4.md |
| Customer API `/api/support` | `be/src/routes/support.ts` | docs/changes/sch-1.4.md |
| Staff API `/api/staff/chats` (`chat.handle`) | `be/src/routes/staffChats.ts` | docs/changes/sch-1.5.md |
| Live events | `be/src/lib/chatEvents.ts` | docs/realtime.md (Staff chat) |
| Customer ChatBox | `fe/src/components/ChatBox.tsx`, `fe/src/supportChat.ts` | docs/changes/sch-1.7.md |
| Staff panel | `fe/src/pages/StaffChats.tsx`, `fe/src/staffChat.ts` | docs/changes/sch-1.8.md |
| Tests | `e2e/unit`, `e2e/integration`, `e2e/py` | docs/changes/sch-1.1.md |

## Not in this round (deferred by the user, 2026-11-15)

- Handing off **off-topic** questions (only limit / Gemini failures hand off).
- Staff requests to save chat content to the knowledge base, admin approval (SRS Req-2) and chunking it (Req-3):
  sch-1.9 / sch-1.10 under `deferred` in the feature list.
- New Playwright specs: the UI was checked by hand (see sch-1.7 / sch-1.8 docs).

## Known limits

- One API process: the live events use an in-process bus (docs/realtime.md).
- The bot's limit is one shared 30 calls/min for all visitors (be/rag/chat.py `over_web_limit`), so under load many
  signed-in customers are handed off at once.
