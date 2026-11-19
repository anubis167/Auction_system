import { expect, test } from '@playwright/test';
import { login } from './helpers';

// pop-0.3: Beat'em header in the 'Beat it! Look'.
test('pop-0.3 guest header: wordmark, four nav links, Sign in; links land on existing pages', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  const header = page.locator('header.topbar');
  await expect(header.getByRole('link', { name: "Beat'em home" })).toContainText("Beat'em");
  expect(await header.evaluate((el) => getComputedStyle(el).borderBottomWidth)).toBe('4px');
  expect(await header.locator('.brand-name').evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^"?Bangers/);
  expect(await header.locator('.brand-accent').evaluate((el) => getComputedStyle(el).color)).toBe('rgb(214, 40, 40)');

  const nav = page.locator('#main-nav');
  await expect(nav.getByRole('link')).toHaveText(['Live now', 'Ending soon', 'Categories', 'Sell with us']);
  const signIn = header.getByRole('link', { name: 'Sign in' });
  await expect(signIn).toBeVisible();
  expect(await signIn.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(29, 78, 216)');

  // Ending soon -> browse sorted by ending soon
  await nav.getByRole('link', { name: 'Ending soon' }).click();
  await expect(page).toHaveURL(/\/\?sort=ending$/);
  await expect(page.getByTestId('sort')).toHaveValue('ending');

  // Categories -> the category list on the home page
  await nav.getByRole('link', { name: 'Categories' }).click();
  await expect(page).toHaveURL(/\/#categories$/);
  await expect(page.locator('#categories')).toBeInViewport();

  // Sell with us -> Sign in for a guest, then the create-auction page
  await nav.getByRole('link', { name: 'Sell with us' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Username or email').fill('alice');
  await page.getByLabel('Password', { exact: true }).fill('Password123!');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/auctions\/new$/);
});

test('pop-0.3 signed-in customer keeps their own menu', async ({ page }) => {
  await login(page, 'bob');
  const nav = page.locator('#main-nav');
  await expect(nav.getByRole('link', { name: 'Dashboard' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Sell with us' })).toHaveCount(0);
  await expect(page.getByTestId('bid-limit')).toBeVisible();
  await expect(page.getByTestId('sign-in')).toHaveCount(0);
});

test('pop-0.3 at 375px the nav folds behind the menu button, no horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/');
  const toggle = page.getByTestId('nav-toggle');
  const box = (await toggle.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await expect(page.locator('#main-nav').getByRole('link', { name: 'Live now' })).toBeHidden();
  await toggle.click();
  const live = page.locator('#main-nav').getByRole('link', { name: 'Live now' });
  await expect(live).toBeVisible();
  expect((await live.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
