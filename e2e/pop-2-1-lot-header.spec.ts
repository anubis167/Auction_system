import { expect, test } from '@playwright/test';
import { createAuctionViaApi, createGoodsViaApi, login, logout, uploadImageViaApi } from './helpers';

// pop-2.1: breadcrumb, halftone gallery with keyboard thumbnails, lot meta line.
test('pop-2.1 breadcrumb, gallery thumbnails by keyboard, meta line with the seller', async ({ page }) => {
  await login(page, 'alice');
  const categories = (await (await page.request.get('/api/categories')).json()).categories as { id: number; name: string }[];
  const cat = categories[0];
  const images = [await uploadImageViaApi(page.request), await uploadImageViaApi(page.request)];
  const goods = await createGoodsViaApi(page.request, { name: 'Header Teapot', categoryId: cat.id, images });
  const lot = await createAuctionViaApi(page.request, { name: 'Header Teapot', goodsId: goods.id, description: 'A blue teapot. '.repeat(30) });
  await logout(page);

  await page.goto(`/auctions/${lot.id}`);
  const lotNo = `Lot ${String(lot.id).padStart(3, '0')}`;
  const crumb = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(crumb).toContainText(`Home/${cat.name}/${lotNo}`);
  await expect(page.getByTestId('lot-meta')).toHaveText(`${lotNo} · ${cat.name} · alice`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Header Teapot');
  await expect(page.getByTestId('lot-badge-live')).toContainText('Live');

  // Thumbnails are buttons: Tab to the second, Enter shows it.
  const hero = page.getByTestId('gallery-hero');
  await expect(hero).toHaveAttribute('src', images[0]);
  await page.getByRole('button', { name: 'Show image 1' }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Show image 2' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(hero).toHaveAttribute('src', images[1]);
  await expect(page.getByRole('button', { name: 'Show image 2' })).toHaveAttribute('aria-pressed', 'true');

  // The long description is cut under the title; the link opens the Description tab.
  await page.getByTestId('read-description').click();
  await expect(page.getByRole('tab', { name: 'Description' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('lot-tabpanel')).toContainText('A blue teapot.');

  await crumb.getByRole('link', { name: cat.name }).click();
  await expect(page).toHaveURL(new RegExp(`/\\?category=${cat.id}$`));
});
