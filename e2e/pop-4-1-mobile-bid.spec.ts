import { expect, test, type Page } from '@playwright/test';
import { createAuctionViaApi, login, logout, registerViaApi } from './helpers';

// pop-4.1: phone quick-bid band (<= 640px), same bid call and checks as the bid panel.
async function loginThenPhone(page: Page, who: string) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page, who); // the username is hidden next to the avatar on phones
  await page.setViewportSize({ width: 375, height: 812 });
}

test('pop-4.1 band at 375px: chips set the amount, Bid places it; not on desktop', async ({ page }) => {
  await login(page, 'alice');
  const lot = await createAuctionViaApi(page.request, { name: 'Band Radio', initialPrice: 30 });
  await logout(page);

  await loginThenPhone(page, 'bob');
  await page.goto(`/auctions/${lot.id}`);
  const band = page.getByTestId('bid-band');
  await expect(band).toBeVisible();
  expect(await band.evaluate((el) => [getComputedStyle(el).position, getComputedStyle(el).backgroundColor])).toEqual(['sticky', 'rgb(255, 214, 10)']);
  // It is stuck to the bottom of the screen.
  const box = (await band.boundingBox())!;
  expect(Math.round(box.y + box.height)).toBe(812);
  await expect(page.getByTestId('band-clock')).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
  await expect(page.getByTestId('band-note')).toHaveText("0 bids · You'll bid $30.00");
  // Ladder chips (QUICK_STEPS 1, 2, 5 from $30 with a $1 increment).
  await expect(band.getByRole('group', { name: 'Bid amount' }).getByRole('button')).toHaveText(['$30.00', '$31.00', '$34.00']);
  await page.getByTestId('band-chip-2').click();
  await expect(page.getByTestId('band-chip-2')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('band-note')).toHaveText("0 bids · You'll bid $31.00");
  const chipBox = (await page.getByTestId('band-chip-2').boundingBox())!;
  expect(chipBox.height).toBeGreaterThanOrEqual(44);

  await page.getByTestId('band-bid').click();
  await expect(page.getByTestId('current-price')).toHaveText('$31.00');
  await expect(page.getByTestId('band-price')).toHaveText('$31.00');
  await expect(band.getByTestId('pow-burst')).toHaveText('POW!');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  // Scrolled to the end, the band has stopped above the footer, whose last link stays reachable.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const last = page.getByTestId('site-footer').locator('a').last();
  const lastBox = (await last.boundingBox())!;
  const bandNow = (await band.boundingBox())!;
  expect(bandNow.y + bandNow.height).toBeLessThanOrEqual(lastBox.y);

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(band).toBeHidden();
});

test('pop-4.1 band bid over the available credit shows the plain error', async ({ page }) => {
  await login(page, 'alice');
  const lot = await createAuctionViaApi(page.request, { name: 'Band Piano', initialPrice: 500 });
  await logout(page);
  const username = `band${Date.now().toString(36)}`;
  await registerViaApi(page.request, username); // a new account has no credit
  await loginThenPhone(page, username);
  await page.goto(`/auctions/${lot.id}`);
  await page.getByTestId('band-bid').click();
  await expect(page.getByTestId('band-error')).toHaveText('Bid exceeds your available credit');
  await expect(page.getByTestId('bid-band').getByTestId('pow-burst')).toHaveCount(0);
});
