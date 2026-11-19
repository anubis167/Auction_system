import { expect, test } from '@playwright/test';
import { createAuctionViaApi, login, logout } from './helpers';

// pop-2.3: brand bid panel: Place bid! (primary lg), quick bids, minimum line, POW! on success only.
test('pop-2.3 a valid bid pops an announced POW!; an over-credit bid shows plain error text; outbid copy', async ({ page, browser }) => {
  await login(page, 'alice');
  const lot = await createAuctionViaApi(page.request, { name: 'Pow Jukebox', initialPrice: 20 });
  await logout(page);

  await login(page, 'bob');
  await page.goto(`/auctions/${lot.id}`);
  await expect(page.getByText('Minimum next bid $20.00')).toBeVisible();
  const place = page.getByTestId('place-bid');
  await expect(place).toHaveText('Place bid! $20.00');
  await expect(place).toHaveClass(/btn-primary/);
  await expect(place).toHaveClass(/btn-lg/);
  expect(await place.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(214, 40, 40)');
  await expect(page.getByTestId('quick-bid-1')).toHaveClass(/btn-secondary/);

  // Over the available credit: plain error, no sound word.
  await page.getByTestId('bid-input').fill('99999999');
  await place.click();
  await expect(page.getByTestId('bid-error')).toHaveText('Bid exceeds your available credit');
  await expect(page.getByTestId('pow-burst')).toHaveCount(0);
  await expect(page.locator('.lot-bid-card')).not.toContainText(/POW!|BAM!|ZAP!/);

  // Valid bid: POW! pops in a polite live region; standing uses the 'you' badge.
  await page.getByTestId('bid-input').fill('20');
  await place.click();
  const pow = page.getByTestId('pow-burst');
  await expect(pow).toHaveText('POW!');
  await expect(pow).toHaveAttribute('role', 'status');
  await expect(pow).toHaveAttribute('aria-live', 'polite');
  await expect(page.getByTestId('bid-ok')).toHaveText("You're the top bidder!");
  expect(await page.getByTestId('bid-ok').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(29, 78, 216)');

  // Another customer outbids: plain outbid text, no sound word.
  const ctx = await browser.newContext();
  const carol = await ctx.newPage();
  await login(carol, 'carol');
  expect((await carol.request.post(`/api/auctions/${lot.id}/bids`, { data: { amount: 25 } })).status()).toBe(201);
  await ctx.close();
  await expect(page.getByTestId('outbid-notice')).toHaveText("You've been outbid — jump back in?");
  await expect(page.getByTestId('my-standing')).not.toContainText(/POW!|BAM!/);
});
