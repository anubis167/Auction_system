import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

// pop-5.2: staff and admin pages on the brand tokens; business tools carry no sound words.
const SOUND = /POW!|BAM!|ZAP!|WHOA!|KAPOW!|GONE!/;

async function check(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('main h1').first()).toBeVisible();
  const look = await page.evaluate(() => ({ bg: getComputedStyle(document.body).backgroundColor, scroll: document.documentElement.scrollWidth }));
  expect(look.bg, url).toBe('rgb(255, 248, 231)');
  expect(look.scroll, url).toBeLessThanOrEqual(1280);
  await expect(page.locator('main'), url).not.toContainText(SOUND);
}

/** WCAG contrast of two rgb()/#rrggbb colours. */
function contrast(a: number[], b: number[]) {
  const lum = (c: number[]) => {
    const [r, g, bl] = c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.trim().slice(i, i + 2), 16));

test('pop-5.2 staff pages render on paper at 1280 with brand chart colours', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page, 'staff');
  for (const url of ['/staff/statistics', '/staff/auctions', '/staff/goods', '/staff/credit', '/staff/chats']) await check(page, url);

  // Chart series: brand hues with >= 3:1 against the white chart panel they are drawn on.
  await page.goto('/staff/statistics');
  const series = await page.evaluate(() => [1, 2, 3, 4].map((n) => getComputedStyle(document.documentElement).getPropertyValue(`--series-${n}`)));
  expect(series.map((s) => s.trim().toUpperCase())).toEqual(['#1D4ED8', '#D62828', '#111111', '#FF4F9A']);
  for (const s of series) {
    expect(contrast(hex(s), [255, 255, 255])).toBeGreaterThanOrEqual(3);
  }
  // Status words next to each colour in the legend are checked by stf-003 (needs a seeded date range).
});

test('pop-5.2 admin pages render on paper at 1280', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page, 'admin');
  for (const url of ['/admin/users', '/admin/users/new', '/admin/permissions']) await check(page, url);
  // Tables: ink header rule, dashed row dividers.
  await page.goto('/admin/users');
  const td = page.locator('table tbody td').first();
  expect(await td.evaluate((el) => getComputedStyle(el).borderBottomStyle)).toBe('dashed');
});
