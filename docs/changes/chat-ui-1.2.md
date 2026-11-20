# chat-ui-1.2: Chat widget UI with conversation history, session switching, and timestamps

Updated the embedded floating chat widget (`fe/src/components/ChatBox.tsx`) with a complete conversation history view, session management, title preview, message timestamps, quick suggestion chips, and responsive dark-theme styles.

## Features Added

- **Multi-session Conversation Header Controls**:
  - `chat-new-btn`: "New conversation" button to start a fresh chat while retaining previous sessions.
  - `chat-history-toggle`: Button with clock icon to switch between active conversation and conversation history view.
  - `chat-close`: Header '×' button to close the chat widget.
  - Session title and status display in header.
- **Conversation History View (`chat-history-view`)**:
  - Lists all past conversation sessions with auto-derived titles, relative timestamps ("Just now", "5m ago", etc.), and message counts.
  - Highlights active conversation with a "Current" badge (`chat-history-active-badge`).
  - Clicking a past session restores that conversation in the chat box (`selectSession`).
  - Individual session delete button (`chat-delete-session`) with trash icon.
  - "Clear all" button (`chat-history-clear`) to clear all past sessions.
  - Empty state (`chat-history-empty`) with friendly onboarding icon, guidance, and "Start a conversation" button when history is empty.
- **Active Chat View Enhancements**:
  - Message bubbles display clock timestamps (`formatMessageTime`).
  - Suggestion chips (`chat-chips` with quick prompt buttons) when starting a new conversation.
  - Retains and restores active session across page navigation and reloads.
- **Brand Dark Theme Styles (`fe/src/styles.css`)**:
  - Integrated styles for `.chat-head`, `.chat-history-list`, `.chat-history-item`, `.chat-chips`, `.chat-msg-time`, and smooth hover/active transitions matching the application palette.

## Changed Files

- `fe/src/components/ChatBox.tsx`: Rewritten with view routing, session switching, history browsing, and timestamps.
- `fe/src/styles.css`: Styles for header actions, history list, item cards, chips, and timestamps.
- `docs/changes/chat-ui-1.2.md`: Change documentation.

## Verification

- `npm test -w fe`: 28 test files passed (186 tests).
- `npm run build -w fe`: Built successfully in 1.95s without any TypeScript or bundling warnings.
