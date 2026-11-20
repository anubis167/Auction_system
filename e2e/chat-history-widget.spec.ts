import { expect, test } from '@playwright/test';

test.describe('chat-ui-1.3: chat widget conversation history and session management', () => {
  test('full chat widget journey: send message, create new chat, browse history, switch sessions, delete, and persistence', async ({
    page,
  }) => {
    // Intercept /api/chat so the test runs quickly and deterministically without external API dependency
    await page.route('**/api/chat', async (route) => {
      const body = route.request().postDataJSON();
      const lastMsg = body?.messages?.[body.messages.length - 1]?.text || '';

      let reply = 'I am your Beat\'em auction assistant. Let me know how I can help.';
      if (lastMsg.toLowerCase().includes('bid')) {
        reply = 'To place a bid, navigate to any live auction lot and enter your amount.';
      } else if (lastMsg.toLowerCase().includes('return')) {
        reply = 'Returns must be requested within 48 hours of lot delivery.';
      } else if (lastMsg.toLowerCase().includes('persistent')) {
        reply = 'Your conversation was stored and restored successfully.';
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ reply }),
      });
    });

    // 1. Visit home page and open the chat widget
    await page.goto('/');
    const chatToggle = page.getByTestId('chat-toggle');
    await expect(chatToggle).toBeVisible();

    const chatPanel = page.getByTestId('chat-panel');
    await expect(chatPanel).toBeHidden();

    await chatToggle.click();
    await expect(chatPanel).toBeVisible();

    // Verify welcome message and quick chips
    const chatLog = page.getByTestId('chat-log');
    await expect(chatLog).toContainText('Hi! How can we help you today?');

    const quickChips = page.getByTestId('chat-chips');
    await expect(quickChips).toBeVisible();
    await expect(quickChips).toContainText('Who can place a bid?');

    // 2. Send first message using quick prompt chip
    await quickChips.getByRole('button', { name: 'Who can place a bid?' }).click();

    // Verify message sent, reply received, and timestamp displayed
    await expect(chatLog).toContainText('Who can place a bid?');
    await expect(chatLog).toContainText('To place a bid, navigate to any live auction lot');
    await expect(page.locator('.chat-msg-time').first()).toBeVisible();

    // Header subtitle updates with title
    await expect(page.locator('.chat-head-sub')).toContainText('Who can place a bid?');

    // 3. Start a new conversation via header 'New Chat' button
    const newChatBtn = page.getByTestId('chat-new-btn');
    await expect(newChatBtn).toBeVisible();
    await newChatBtn.click();

    // New conversation has fresh log and quick chips back
    await expect(chatLog).toContainText('Hi! How can we help you today?');
    await expect(chatLog).not.toContainText('To place a bid, navigate to any live auction lot');
    await expect(page.getByTestId('chat-chips')).toBeVisible();

    // Send a message in the second conversation
    const chatInput = page.getByTestId('chat-input');
    await chatInput.fill('What is the return policy?');
    await page.getByTestId('chat-send').click();

    await expect(chatLog).toContainText('What is the return policy?');
    await expect(chatLog).toContainText('Returns must be requested within 48 hours');

    // 4. Open Chat History view
    const historyToggle = page.getByTestId('chat-history-toggle');
    await historyToggle.click();

    const historyView = page.getByTestId('chat-history-view');
    await expect(historyView).toBeVisible();
    await expect(page.locator('.chat-title')).toContainText('Chat History');

    // Verify both conversation sessions are listed
    const historyItems = page.getByTestId('chat-history-item');
    await expect(historyItems).toHaveCount(2);

    // One should have Current badge
    await expect(historyItems.filter({ hasText: 'What is the return policy?' })).toContainText('Current');
    await expect(historyItems.filter({ hasText: 'Who can place a bid?' })).toBeVisible();

    // 5. Switch back to first conversation by clicking it in history
    await historyItems.filter({ hasText: 'Who can place a bid?' }).getByRole('button', { name: /Open conversation/ }).click();

    // Verify switched back to chat view and restored first conversation
    await expect(page.getByTestId('chat-log')).toContainText('Who can place a bid?');
    await expect(page.getByTestId('chat-log')).toContainText('To place a bid, navigate to any live auction lot');
    await expect(page.getByTestId('chat-log')).not.toContainText('What is the return policy?');

    // 6. Delete a single session from history
    await historyToggle.click();
    await expect(historyView).toBeVisible();

    const returnItem = historyItems.filter({ hasText: 'What is the return policy?' });
    await returnItem.getByTestId('chat-delete-session').click();

    // Only one item remains now
    await expect(page.getByTestId('chat-history-item')).toHaveCount(1);
    await expect(page.getByTestId('chat-history-item')).toContainText('Who can place a bid?');

    // 7. Clear all history
    const clearBtn = page.getByTestId('chat-history-clear');
    await clearBtn.click();

    // History is now empty
    const emptyState = page.getByTestId('chat-history-empty');
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText('No conversation history yet');

    // 8. Start a conversation from the empty state and verify persistence across reload
    await page.getByTestId('chat-start-new-btn').click();
    await expect(page.getByTestId('chat-input')).toBeVisible();

    await page.getByTestId('chat-input').fill('Persistent message across reload');
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('chat-log')).toContainText('Your conversation was stored and restored successfully.');

    // Reload the page
    await page.reload();

    // Open chat widget again and verify conversation restored
    await page.getByTestId('chat-toggle').click();
    await expect(page.getByTestId('chat-panel')).toBeVisible();
    await expect(page.getByTestId('chat-log')).toContainText('Persistent message across reload');
    await expect(page.getByTestId('chat-log')).toContainText('Your conversation was stored and restored successfully.');

    // Close panel with header close button
    await page.getByTestId('chat-close').click();
    await expect(page.getByTestId('chat-panel')).toBeHidden();
  });
});
