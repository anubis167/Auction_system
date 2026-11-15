# sch-1.7 Customer ChatBox switches to staff mode

## Behavior

- A signed-in customer chats with the bot as before. When `/api/chat` answers `{handoff: true, reason}` (sch-1.3),
  the box posts the bot transcript to `POST /api/support/conversations` (sch-1.4) and switches to staff mode:
  title "Chat with our staff", note "Connecting you to our staff...". Later messages go to
  `POST /api/support/conversations/:id/messages`, never to the bot.
- Live (sch-1.6, via `/api/me/events`): "<name> from our staff joined the chat." on claim, staff replies as they
  are sent, and on close "The chat with our staff has ended. You are talking to the assistant again." (bot mode).
- The open conversation is read again (`GET /api/support/conversations/mine`) on load and each time the box is
  opened, so a reload, another tab's handoff or events missed while the stream was down are picked up.
- Guests, staff and admins only talk to the bot (no handoff; the bot's error shows as before).
- Only user/bot turns are ever sent to the bot or as the transcript; staff replies and notes are display only.

## Changed files

- `fe/src/supportChat.ts` (new): pure state rules (transcript, bot history, server -> line, live events, dedupe by message id).
- `fe/src/components/ChatBox.tsx`: bot/staff modes.
- `fe/src/store/useUserEvents.ts`: forwards `chat-message` / `chat-claimed` / `chat-closed` as a `support-chat` window event.
- `fe/src/styles.css`: `.chat-msg-staff`, `.chat-msg-system`.
- Test: `e2e/unit/sch-1-7-support-chat.test.ts` (6 tests).

## Manual check (2026-11-15)

Throwaway Playwright script (not committed; no new e2e specs this round) against the e2e servers and db, with
`/api/chat` stubbed to hand off: handoff -> staff mode, staff claim and reply appear live, own message shown once,
customer message stored and bot not called, reload restores, close returns to the bot, guest stays with the bot.
Screenshots reviewed at 1440 px and 390 px.
