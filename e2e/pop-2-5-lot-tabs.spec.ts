import { expect, test } from '@playwright/test';
import { createAuctionViaApi, login, logout } from './helpers';

// pop-2.5: Description / Condition / Seller tabs (keyboard), facts table, chat from the condition tab.
test('pop-2.5 keyboard tabs, condition text, chat opens from the condition link, no placeholder brackets', async ({ page }) => {
  await login(page, 'alice');
  const lot = await createAuctionViaApi(page.request, { name: 'Tabbed Lamp', description: 'Brass desk lamp, rewired.', condition: 'like_new' });
  await logout(page);
  // The chat health check is not part of this test; keep the box online.
  await page.route('**/api/chat/health', (r) => r.fulfill({ json: { ok: true } }));

  await page.goto(`/auctions/${lot.id}`);
  const tabs = page.getByRole('tablist', { name: 'Lot details' });
  const panel = page.getByTestId('lot-tabpanel');
  await expect(tabs.getByRole('tab')).toHaveText(['Description', 'Condition', 'Seller']);
  await expect(panel).toHaveText('Brass desk lamp, rewired.');

  // Arrow keys move focus, Enter selects.
  await tabs.getByRole('tab', { name: 'Description' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: 'Condition' })).toBeFocused();
  await expect(tabs.getByRole('tab', { name: 'Description' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(tabs.getByRole('tab', { name: 'Condition' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('condition-text')).toHaveText(/^Condition: \S/);

  // Space on Seller.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press(' ');
  await expect(page.getByTestId('seller-name')).toHaveText('alice');
  await expect(panel.getByRole('link', { name: 'See more lots from this seller' })).toHaveAttribute('href', '/?q=alice&field=seller');

  // Condition tab -> ask the auction desk opens the chat widget.
  await tabs.getByRole('tab', { name: 'Condition' }).click();
  await expect(page.getByTestId('chat-panel')).toBeHidden();
  await page.getByTestId('ask-desk').click();
  await expect(page.getByTestId('chat-panel')).toBeVisible();

  // Facts: only real fields; no '[PLACEHOLDER]' text anywhere.
  const facts = page.getByTestId('lot-facts');
  await expect(facts).toContainText('Starting price$100.00');
  await expect(page.getByTestId('status')).toHaveText('active');
  await expect(page.locator('main')).not.toContainText('[');
});
