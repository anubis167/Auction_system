# rag-train-4 Thumbs up or down on a bot answer

| File | Change |
|---|---|
| be/src/routes/rag.ts | `PUT /api/rag/turns/:id/feedback` (X-Internal-Token) `{visitor, feedback: up/down}`: 404 for an unknown or soft-deleted turn, 403 when sha256(visitor) is not the turn's session hash, else saves (a new tap replaces the old one). |
| be/rag/chat.py | `POST /api/chat/feedback` `{turnId, feedback, visitor}`: checks the input and relays it; Node's 400/403/404 are passed on, other failures 502. The browser reaches it through the existing /api/chat proxy. |
| fe/src/chatHistory.ts | `ChatMessage.turnId` / `feedback`; `setMessageFeedback()` sets, replaces or clears one message's thumbs and saves (so it stays after reload). |
| fe/src/components/ChatBox.tsx | Bot answers that came back with a `turnId` show "Helpful answer" / "Not helpful answer" toggle buttons (`aria-pressed`); the choice shows at once and is put back with an error line if the server refuses it. |
| fe/src/styles.css | `.chat-feedback`, `.chat-feedback-btn` (44x44 px, pressed = yellow). |
| e2e/integration/rag-train-4-feedback.test.ts | New: set, replace, 403 other visitor, 400/404/401, deleted turn 404. |
| e2e/py/rag_train_4_feedback_test.py | New: relay with the service token, input checks, refusals passed on. |
| e2e/rag-train-4-thumbs.spec.ts | New: tap, replace, reload, 44 px targets, 403 for another token, refused save rolls back. |
| fe/src/chatHistory.test.ts | `setMessageFeedback` case. |
