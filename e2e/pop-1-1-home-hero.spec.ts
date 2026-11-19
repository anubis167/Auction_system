import { expect, test, type Page } from '@playwright/test';
import { createAuctionViaApi, login, logout, topUpViaApi } from './helpers';

// pop-1.1: 'Going, going... GONE!' hero with the hot live lot (first trending lot from GET /api/auctions).
/** The e2e database holds many live lots; put `id` first in the unfiltered home answer (or drop live lots). */
async function shapeHomeList(page: Page, shape: (auctions: { id: number; status: string }[]) => unknown[]) {
  await page.route(/\/api\/auctions$/, async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    await route.fulfill({ response: res, json: { ...body, auctions: shape(body.auctions) } });
  });
}

test('pop-1.1 hot lot card shows a live lot with its current bid and opens it', async ({ page }) => {
  await login(page, 'alice');
  const lot = await createAuctionViaApi(page.request, { name: 'Hero Jukebox', initialPrice: 100 });
  await logout(page);
  await login(page, 'bob');
  await topUpViaApi(page.request, 200);
  expect((await page.request.post(`/api/auctions/${lot.id}/bids`, { data: { amount: 110 } })).status()).toBe(201);
  await logout(page);

  await shapeHomeList(page, (list) => [...list.filter((a) => a.id === lot.id), ...list.filter((a) => a.id !== lot.id)]);
  await page.goto('/');
  const hero = page.getByTestId('hero');
  await expect(hero.getByRole('heading', { level: 1 })).toHaveText('Going, going... GONE!');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  const hot = hero.getByTestId('hot-lot');
  await expect(hot).toContainText('Hot lot!');
  await expect(hot).toContainText('Live');
  await expect(hot).toContainText('Hero Jukebox');
  await expect(hot).toContainText(`Lot ${String(lot.id).padStart(3, '0')}`);
  await expect(hot.getByTestId('hot-lot-price')).toHaveText('$110.00');
  expect(await hot.getByTestId('hot-lot-price').evaluate((el) => getComputedStyle(el).color)).toBe('rgb(214, 40, 40)');
  await hot.click();
  await expect(page).toHaveURL(new RegExp(`/auctions/${lot.id}$`));
});

test('pop-1.1 without live lots the hero stays and the hot lot card is hidden; phone width fits', async ({ page }) => {
  await shapeHomeList(page, (list) => list.filter((a) => a.status !== 'active'));
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/');
  await expect(page.getByTestId('hero').getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText('No auctions are live right now.')).toBeVisible();
  await expect(page.getByTestId('hot-lot')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test('pop-1.1 Browse live lots jumps to the Live lots section', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('hero').getByRole('link', { name: 'Browse live lots' }).click();
  await expect(page).toHaveURL(/#live$/);
  await expect(page.getByRole('heading', { name: 'Live lots' })).toBeInViewport();
});
