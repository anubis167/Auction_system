# chat-ui-1.1: Chat history session management and storage module

Created session storage and lifecycle management in `fe/src/chatHistory.ts` for the embedded chat widget.

## Features Added

- Data models: `ChatMessage` (with `role`, `text`, `timestamp`) and `ChatSession` (with `id`, `title`, `createdAt`, `updatedAt`, `messages`).
- Automatic title derivation: `deriveTitle` generates human-readable titles from the user's first prompt, truncated gracefully with ellipsis, or defaults to "New Conversation".
- Multi-session persistence: `loadSessions`, `saveSessions`, `loadActiveSessionId`, `saveActiveSessionId`, and `clearAllSessions` with safe JSON handling and cross-environment storage access (`window.localStorage` and `globalThis.localStorage`).
- Session mutations: `createSession`, `addMessageToSession` (appends message, updates timestamp and title), and `deleteSession` (removes session and falls back to remaining session or null).
- Human-friendly timestamps: `formatRelativeTime` (e.g., "Just now", "5m ago", "2h ago", "Yesterday", "3d ago", or date) and `formatMessageTime` (clock time, e.g. "10:30 AM").

## Changed Files

- `fe/src/chatHistory.ts`: Session management and storage utilities.
- `fe/src/chatHistory.test.ts`: 21 unit tests covering all functions and edge cases.
- `docs/changes/chat-ui-1.1.md`: Change documentation.

## Verification

- `npm test -w fe`: 28 test files passed (186 tests).
- `npm run build -w fe`: Clean TypeScript compilation and Vite bundle build.
