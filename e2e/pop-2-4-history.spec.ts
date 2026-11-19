import { expect, test } from '@playwright/test';
import { createAuctionViaApi, login, logout } from './helpers';

// pop-2.4: bid history panel (sky-cyan header, pow-red Bangers amounts) still updates live over SSE.
test('pop-2.4 a new bid appears at the top of the history in another browser without reload', async ({ page, browser }) => {
  await login(page, 'alice');
  const lot = await createAuctionViaApi(page.request, { name: 'History Banjo', initialPrice: 40 });
  await logout(page);

  await page.goto(`/auctions/${lot.id}`);
  const card = page.locator('.bid-history-card');
  await expect(card).toContainText('No bids yet.');
  expect(await card.locator('.ui-card-head').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(94, 225, 240)');
  await page.evaluate(() => ((window as unknown as { __pop24: boolean }).__pop24 = true));

  const ctx = await browser.newContext();
  const bob = await ctx.newPage();
  await login(bob, 'bob');
  await bob.goto(`/auctions/${lot.id}`);
  await bob.getByTestId('bid-input').fill('45');
  await bob.getByTestId('place-bid').click();
  await expect(bob.getByTestId('bid-history').getByTestId('you')).toBeVisible();
  await ctx.close();

  const top = page.getByTestId('bid-history').getByRole('row').nth(1);
  await expect(top).toContainText('bob');
  await expect(top).toContainText('$45.00');
  const amount = top.locator('.bid-amount');
  expect(await amount.evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el).fontFamily])).toEqual(['rgb(214, 40, 40)', expect.stringMatching(/^"?Bangers/)]);
  // Same page, no reload.
  expect(await page.evaluate(() => (window as unknown as { __pop24?: boolean }).__pop24)).toBe(true);
});
