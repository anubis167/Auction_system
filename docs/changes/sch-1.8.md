# sch-1.8 Staff chat panel page

SRS: chat panel for staff that handles many customers at once, in real time (Req-1).

## Page `/staff/chats` ("Customer chats" in the staff/admin nav, permission `chat.handle`)

- Left: **Waiting** (the queue, oldest first) and **Mine** (claimed by me), with counts. Each row: customer, last
  message, why the bot handed off, and an unread badge ("2 new") for customer messages in conversations not on screen.
- Right: the selected thread (customer left, staff right, bot lines as notes). Waiting -> **Claim this chat**;
  mine -> reply box and **Close chat** (confirm dialog); someone else's -> read only; closed -> "This chat has ended."
- Drafts are kept per conversation while switching.
- Live, no reload: new handoffs, claims by others (the row leaves Waiting), messages, closes. The page opens
  `/api/staff/events` (queue) and `/api/me/events` (its own conversations' messages, sch-1.6) while it is open,
  and reloads both lists after a dropped stream comes back.
- Unread counts live in the page (no read-tracking columns; see sch-1.5).

## Changed files

- `fe/src/staffChat.ts` (new): pure panel state (lists, threads, unread, live events, dedupe).
- `fe/src/pages/StaffChats.tsx` (new), `fe/src/App.tsx` (route), `fe/src/components/Layout.tsx` (nav link), `fe/src/styles.css`.
- Test: `e2e/unit/sch-1-8-staff-chat.test.ts` (6 tests).

## Manual check (2026-11-15)

Throwaway Playwright script (not committed; no new e2e specs this round) on the e2e servers: 2 customers + 2 staff
(staff2 inserted for the run). Both handoffs appear live in both panels; staff claims alice and staff2's list drops
her live; one staff member holds both chats; draft survives switching; each customer gets only their own reply live;
unread badge appears and clears; close via dialog returns the customer to the bot; customers cannot open the page.
Screenshots reviewed at 1440, 1000 and 390 px.
