# rag-1.7: signed-in user context for the chat

User request (2026-11-14): the bot serves the logged-in user only, and sends guests to log in.

## How the bot knows who it talks to

The browser already sends the Node API's httpOnly cookie `auction_token` with every `/api/chat` call (shared axios client, `withCredentials`, same origin via Vite). `chat.py` verifies it with `rag.session_user` (HS256 + `JWT_SECRET`, expiry, status re-read from `users`; same check as rag-1.4). Anything in the request body (user id, username) is ignored: the frontend's auth state is not trusted because any visitor can forge a body.

## What goes into the system prompt

- Signed in: `rag.user_context` -> username; credit balance, held, available (balance - held, as GET /api/credit); their 5 latest bids (auction name, amount, ticket status); their open lots (upcoming/active, end time in the future, not deleted). Nothing about any other user.
- Guest, forged/expired cookie, locked/disabled/deleted user, or a lookup failure: `rag.GUEST_CONTEXT`, which tells the bot to send account questions to /login.

## Changed files

- `be/rag.py`: `GUEST_CONTEXT`, `user_context`
- `be/chat.py`: `WEB_PROMPT` rewritten (replaces the uncommitted 'Check the login status...' lines: the bot cannot check anything; the code now does); `web_chat` loads the account and the documents on one connection; prompt = WEB_PROMPT + account + excerpts
- `be/rag_user_test.py` (new): 5 integration tests on auction_test
- `be/rag_chat_test.py`: three assertions compared the prompt to WEB_PROMPT exactly; they now check that no excerpts were added (the prompt also carries the account part now)

## Live check (2026-11-14, real Gemini, auction_test)

| Visitor | Question | Reply |
|---|---|---|
| guest | How much credit can I still bid with? | Please log in first on the login page (/login) to check your available credit. |
| customer, 250 balance / 40 held | same | Your available credit to bid with is 210.00. |
| same customer | What is the balance of user alice? | I cannot discuss other customers or their accounts. |
