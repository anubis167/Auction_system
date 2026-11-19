import { expect, test } from '@playwright/test';
import { login, registerViaApi, staffApi } from './helpers';

// pop-3.1: Holler! launcher and the Auction desk panel (bot replies stubbed; staff mode uses the real APIs).
test('pop-3.1 launcher opens and closes by keyboard; chips send their text', async ({ page }) => {
  await page.route('**/api/chat/health', (r) => r.fulfill({ json: { ok: true } }));
  await page.route('**/api/chat', (r) => r.fulfill({ json: { reply: 'Open a lot and press Place bid!' } }));
  await page.goto('/');
  const toggle = page.getByTestId('chat-toggle');
  const panel = page.getByTestId('chat-panel');
  await expect(page.locator('.chat-teaser')).toHaveText('Questions? Holler!');
  expect(await toggle.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('50%');

  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Auction desk' })).toBeVisible();
  await expect(page.getByTestId('chat-status')).toHaveText('Online · usually replies in minutes');
  await expect(page.getByTestId('chat-log')).toHaveAttribute('role', 'log');
  await expect(page.getByTestId('chat-log')).toHaveAttribute('aria-live', 'polite');
  await expect(page.getByTestId('chat-chips').getByRole('button')).toHaveText(['How do I bid?', 'How does credit work?', 'Condition report']);

  await page.getByTestId('chat-chips').getByRole('button', { name: 'How do I bid?' }).click();
  await expect(page.getByTestId('chat-log').locator('.chat-msg-user')).toHaveText('How do I bid?');
  await expect(page.getByTestId('chat-log').locator('.chat-msg-model')).toHaveText('Open a lot and press Place bid!');

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(toggle).toBeFocused();
});

test('pop-3.1 a staff reply while the box is closed shows an unread count', async ({ page }) => {
  const username = `holler${Date.now().toString(36)}`;
  await registerViaApi(page.request, username);
  await login(page, username);
  // The customer is handed off to staff (sch-1.3/1.4): an open conversation puts the box in staff mode.
  const res = await page.request.post('/api/support/conversations', { data: { reason: 'limit', transcript: [{ role: 'user', text: 'Is the lamp brass?' }] } });
  expect(res.status(), await res.text()).toBeLessThan(300);
  const { conversation } = (await res.json()) as { conversation: { id: number } };
  await page.goto('/');
  await expect(page.getByTestId('chat-panel')).toHaveAttribute('data-mode', 'staff');
  await expect(page.getByTestId('chat-unread')).toHaveCount(0);

  const staff = await staffApi();
  expect((await staff.post(`/api/staff/chats/${conversation.id}/claim`)).status()).toBe(200);
  expect((await staff.post(`/api/staff/chats/${conversation.id}/messages`, { data: { text: 'Yes, solid brass.' } })).status()).toBe(201);

  await expect(page.getByTestId('chat-unread')).toHaveText('1');
  await expect(page.getByTestId('chat-toggle')).toHaveAttribute('aria-label', 'Open chat, 1 unread');
  await page.getByTestId('chat-toggle').click();
  await expect(page.getByTestId('chat-log')).toContainText('Yes, solid brass.');
  await expect(page.getByTestId('chat-unread')).toHaveCount(0);
  await staff.post(`/api/staff/chats/${conversation.id}/close`);
});
