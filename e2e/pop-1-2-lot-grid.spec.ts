import { expect, test } from '@playwright/test';
import { createAuctionViaApi, login, logout } from './helpers';

// pop-1.2: category ticker, Live lots grid of brand LotCards, filter chips.
const TAG = `lg${Date.now().toString(36)}`;

test('pop-1.2 lot cards: lot no, category, title, price, badges, no-bid text, one link with no nested button', async ({ page }) => {
  await login(page, 'alice');
  const categories = (await (await page.request.get('/api/categories')).json()).categories as { id: number; name: string }[];
  const cat = categories[1];
  const soon = await createAuctionViaApi(page.request, { name: `Soon ${TAG}`, categoryId: cat.id });
  const later = await createAuctionViaApi(page.request, { name: `Later ${TAG}`, categoryId: cat.id, duration: { value: 2, unit: 'hours' } });
  await logout(page);

  await page.goto(`/?q=${TAG}&field=all`);
  const soonCard = page.getByTestId(`auction-card-${soon.id}`);
  const laterCard = page.getByTestId(`auction-card-${later.id}`);
  await expect(soonCard).toContainText(`Lot ${String(soon.id).padStart(3, '0')}`);
  await expect(soonCard).toContainText(cat.name);
  await expect(soonCard.getByRole('heading', { level: 3 })).toHaveText(`Soon ${TAG}`);
  await expect(soonCard).toContainText('$100.00');
  await expect(soonCard).toContainText('Live');
  // Under an hour: the 'Ending soon!' sticker; two hours left: a time chip instead.
  await expect(soonCard.getByTestId('ending-soon')).toHaveText('Ending soon!');
  await expect(laterCard.getByTestId('ending-soon')).toHaveCount(0);
  await expect(laterCard.getByTestId('badge-time')).toHaveText(/^(1h 5\dm|2h 0m)$/);
  // Nobody has bid: never '$0'.
  await expect(soonCard.getByTestId('card-bid-count')).toHaveText('No bids yet');
  // The card's link holds no button; quick-bid buttons are its siblings.
  const link = soonCard.getByRole('link').first();
  await expect(link.locator('button')).toHaveCount(0);
  await expect(soonCard.getByTestId('quick-bid')).toBeVisible();
  // Grid neighbours use different art tones.
  const tones = await page.locator('.lot-grid .lot-media').evaluateAll((els) => els.map((e) => [...e.classList].find((c) => c.startsWith('halftone-'))));
  for (let i = 1; i < tones.length; i++) expect(tones[i]).not.toBe(tones[i - 1]);
});

test('pop-1.2 ticker and chips filter the grid by category', async ({ page }) => {
  await login(page, 'alice');
  const categories = (await (await page.request.get('/api/categories')).json()).categories as { id: number; name: string }[];
  const [a, b] = [categories[0], categories[2]];
  const inA = await createAuctionViaApi(page.request, { name: `Chip A ${TAG}`, categoryId: a.id });
  const inB = await createAuctionViaApi(page.request, { name: `Chip B ${TAG}`, categoryId: b.id });
  await logout(page);

  await page.goto('/');
  const ticker = page.getByTestId('category-ticker');
  await expect(ticker.getByRole('link')).toHaveCount(categories.length);
  await ticker.getByRole('link', { name: a.name, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`\\?category=${a.id}$`));
  await expect(page.getByTestId(`auction-card-${inA.id}`)).toBeVisible();
  await expect(page.getByTestId(`auction-card-${inB.id}`)).toHaveCount(0);

  await page.getByTestId(`category-chips-${b.id}`).click();
  await expect(page.getByTestId(`auction-card-${inB.id}`)).toBeVisible();
  await expect(page.getByTestId(`auction-card-${inA.id}`)).toHaveCount(0);
});

test('pop-1.2 ended lots show GONE!', async ({ page }) => {
  await login(page, 'alice');
  const lot = await createAuctionViaApi(page.request, { name: `Gone ${TAG}` });
  await page.request.post(`/api/dev/auctions/${lot.id}/expire`);
  await expect.poll(async () => (await (await page.request.get(`/api/dev/auctions/${lot.id}/raw`)).json()).status).toBe('ended');
  await page.goto('/');
  await expect(page.getByTestId('section-completed').getByTestId(`auction-card-${lot.id}`)).toContainText('GONE!');
});
