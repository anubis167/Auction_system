# chat-ui-1.3: E2E Playwright test suite for Chat Widget History

Implemented end-to-end integration tests in `e2e/chat-history-widget.spec.ts` covering the entire user journey of the chat widget's multi-session conversation history.

## Scenarios Verified

1. **Initial Widget Interaction**:
   - Opens widget from floating toggle button (`chat-toggle`).
   - Verifies panel visibility (`chat-panel`), initial welcome bubble, and quick prompt chips (`chat-chips`).
   - Interacts with quick chip ("How do I place a bid?") and receives model reply with timestamp.
   - Header subtitle updates with conversation title.
2. **New Chat Creation**:
   - Clicks "New conversation" button (`chat-new-btn`) in widget header.
   - Verifies chat log resets with clean welcome state and chips.
   - Sends a new message in the second conversation ("What is the return policy?").
3. **Browsing Conversation History**:
   - Clicks History toggle button (`chat-history-toggle`).
   - Verifies view switches to history list (`chat-history-view`).
   - Confirms both sessions are listed with derived titles, timestamps, and message counts.
   - Confirms active session indicator badge ("Current").
4. **Session Switching**:
   - Clicks on a previous session in the history list.
   - Verifies that previous conversation's complete message log is accurately restored in the chat log.
5. **Session Deletion & Bulk Clear**:
   - Deletes an individual conversation session via trash button (`chat-delete-session`).
   - Uses "Clear all" button (`chat-history-clear`) to clear all remaining conversation history.
   - Verifies empty state display (`chat-history-empty`).
6. **Storage Persistence**:
   - Starts conversation from empty state, sends message.
   - Reloads the page (`page.reload()`).
   - Reopens chat widget and verifies conversation history persists and restores seamlessly.

## Changed Files

- `e2e/chat-history-widget.spec.ts`: Full Playwright E2E spec.
- `playwright.config.ts`: Configured `reuseExistingServer: !process.env.CI`.
- `docs/changes/chat-ui-1.3.md`: Change documentation.

## Verification

- `npx playwright test e2e/chat-history-widget.spec.ts`: 1/1 test passed cleanly (3.0s).
