# sch-1.6 Realtime chat events (SSE)

SRS Req-1: the chat panel serves many customers in real time. Reuses the rt-001 / stf-009 SSE bus; see the
"Staff chat" section of docs/realtime.md for who receives which event.

## Changed files

- `be/src/lib/chatEvents.ts` (new): `publishChatWaiting`, `publishChatMessages`, `publishChatClaimed`, `publishChatClosed`.
- `be/src/lib/events.ts`: `StaffChannel` gains `chat`.
- `be/src/routes/staffApprovals.ts`: the staff stream opens the `chat` channel for users with `chat.handle`.
- `be/src/routes/support.ts`: handoff publishes `chat-waiting` (new conversation) or the added messages (reused one,
  via `createManyAndReturn`); customer messages publish `chat-message`.
- `be/src/routes/staffChats.ts`: claim, reply, close and admin delete publish their events.
- `docs/realtime.md`: Staff chat section.
- Test: `e2e/integration/sch-1-6-chat-events.test.ts` (2 customers, 2 staff, full handoff -> claim -> reply -> close -> delete
  sequence; who heard what; refused requests publish nothing). `be/tests/staff.events.test.ts` unchanged and passing.

## Change to the plan

Admins do not get every assigned conversation's messages live (planned "or all for admin"): messages stay with the
customer and the staff member handling them. Admins still see the queue live and can open any conversation.
