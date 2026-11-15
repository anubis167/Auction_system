# sch-1.5 Staff conversation API (queue, claim, reply, close)

## Permission `chat.handle`

New permission (migration `20261115100000_chat_handle_permission`), granted to staff and admin like the other
staff permissions; admins can revoke it in the permissions screen. `be/src/lib/permissions.ts` lists it so the seed restores it.

## Routes (`/api/staff/chats`, need `chat.handle`: guests 401, customers 403)

| Route | Notes |
|---|---|
| `GET /?status=waiting\|mine\|all` | `waiting`: the queue, oldest first. `mine`: assigned to the caller. `all` (default): every non-deleted conversation, newest first. Each row has `customer`, `assignedStaff`, `lastMessage`. Max 200. |
| `GET /:id` | With messages. Waiting conversations are visible to all staff; assigned/closed ones only to their staff member and admins (403 otherwise). Deleted -> 404. |
| `POST /:id/claim` | waiting -> assigned to the caller. One conditional `updateMany`, so of two staff claiming at once exactly one gets 200, the other 409. A staff member can hold many conversations. |
| `POST /:id/messages` `{text 1-1000}` | Only the assigned staff member (admin too must claim first): 403 otherwise; closed -> 409. |
| `POST /:id/close` | Assigned staff member or admin; already closed -> 409. The customer can no longer write (sch-1.4 answers 409). |
| `DELETE /:id` | Admin only. Soft delete (`deleted_at`); hidden from every list and from the customer; rows and messages kept. |

Unread counts are not stored: the panel (sch-1.8) counts them from live events.

## Changed files

- `be/src/routes/staffChats.ts` (new), `be/src/app.ts` (mount), `be/src/lib/permissions.ts`
- `be/prisma/migrations/20261115100000_chat_handle_permission/migration.sql`
- `be/tests/sec.permissions.test.ts`: staff's expected permission list now includes `chat.handle` (new grant, same assertion).
- Tests: `e2e/integration/sch-1-5-staff-chat.test.ts` (8), `e2e/unit/sch-1-5-permissions.test.ts` (2)
