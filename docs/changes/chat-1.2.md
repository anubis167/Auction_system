# chat-1.2: embedded chat box

Visitors type in a box on the site and `be/chat.py` answers through Gemini. This replaces the chat-1.1 `m.me` link. Facebook has no embeddable Messenger any more, so site conversations do not appear in the Facebook page inbox.

To run: `python be/chat.py` next to `npm run dev`. Vite proxies `/api/chat` to `http://127.0.0.1:5000` (override with `CHAT_URL`). Production has no Vite, so its web server must route `/api/chat` to `chat.py`.

Changed files:

- `be/chat.py`: `POST /api/chat` (input limits, 30 calls a minute across all visitors); Messenger echoes are skipped; `home()` has its route; model is now `GEMINI_MODEL` = `gemini-flash-lite-latest`, because `gemini-2.5-flash` is refused for this key
- `be/chat_test.py` (new): `python be/chat_test.py`, Gemini stubbed
- `fe/src/components/ChatBox.tsx` (new, replaces `MessengerChat.tsx`), `fe/src/components/Layout.tsx`, `fe/src/styles.css`
- `fe/vite.config.ts`: `/api/chat` proxy
- `fe/src/vite-env.d.ts`, `fe/.env.example` (removed): `VITE_FACEBOOK_PAGE` is gone

No e2e spec, at the user's request (2026-11-06).
