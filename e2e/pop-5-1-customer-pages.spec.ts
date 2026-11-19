import { expect, test, type Page } from '@playwright/test';
import { createSoldAuction, login } from './helpers';

// pop-5.1: customer and auth pages in the 'Beat it! Look'; sound words only where the bank allows them.
const SOUND = /POW!|BAM!|ZAP!|WHOA!|KAPOW!|GONE!/;
const CUSTOMER_PAGES = ['/dashboard', '/my-auctions', '/my-bids', '/goods', '/goods/new', '/auctions/new', '/credit', '/profile', '/change-password'];
const AUTH_PAGES = ['/login', '/register', '/forgot-password'];

async function checkPage(page: Page, url: string, width: number) {
  await page.goto(url);
  await expect(page.locator('main h1').first()).toBeVisible();
  const look = await page.evaluate(() => ({
    bg: getComputedStyle(document.body).backgroundColor,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(look.bg, url).toBe('rgb(255, 248, 231)');
  expect(look.scroll, `${url} at ${width}px`).toBeLessThanOrEqual(width);
}

test('pop-5.1 auth pages at 1280 and 375: paper ground, no horizontal scroll, overline labels, trust Log in', async ({ page }) => {
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 });
    for (const url of AUTH_PAGES) await checkPage(page, url, width);
  }
  await page.goto('/login');
  const label = page.locator('main form label').first();
  expect(await label.evaluate((el) => [getComputedStyle(el).textTransform, getComputedStyle(el).fontWeight])).toEqual(['uppercase', '800']);
  // The input inside the label keeps body text.
  expect(await page.getByLabel('Username or email').evaluate((el) => [getComputedStyle(el).textTransform, getComputedStyle(el).fontSize])).toEqual(['none', '17px']);
  expect(await page.getByRole('button', { name: 'Log in' }).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(29, 78, 216)');
  await expect(page.locator('main')).not.toContainText(SOUND);
  await page.goto('/forgot-password');
  await expect(page.locator('main')).not.toContainText(SOUND);
});

test('pop-5.1 customer pages at 1280 and 375; credit and password pages carry no sound word', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page, 'carol');
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 });
    for (const url of CUSTOMER_PAGES) await checkPage(page, url, width);
  }
  for (const url of ['/credit', '/change-password', '/profile']) {
    await page.goto(url);
    await expect(page.locator('main h1').first()).toBeVisible();
    await expect(page.locator('main')).not.toContainText(SOUND);
  }
});

test('pop-5.1 registering ends on the sign-in page with KAPOW!', async ({ page }) => {
  const username = `kapow${Date.now().toString(36)}`;
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Kay Pow');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Email').fill(`${username}@example.com`);
  await page.getByLabel('Phone').fill('0900000000');
  await page.getByLabel('Password', { exact: true }).fill('Secret123');
  await page.getByLabel('Confirm password').fill('Secret123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/login$/);
  const kapow = page.getByTestId('kapow');
  await expect(kapow.getByRole('status')).toHaveText('KAPOW!');
  await expect(kapow).toContainText("You're in!");
});

test('pop-5.1 a won lot in My biddings shows BAM!', async ({ page }) => {
  const sold = await createSoldAuction(page.request, `Bam Vase ${Date.now().toString(36)}`);
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page, 'bob');
  await page.goto(`/my-bids?q=${encodeURIComponent(sold.name)}`);
  const row = page.getByTestId('my-bids').getByRole('row').filter({ hasText: sold.name });
  await expect(row.getByTestId('my-status')).toHaveText('Won');
  await expect(row.getByTestId('won-bam')).toHaveText('BAM!');
});
