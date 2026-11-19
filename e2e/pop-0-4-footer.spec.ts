import { expect, test } from '@playwright/test';
import { createAuctionViaApi, login, logout } from './helpers';

// pop-0.4: the Beat'em footer in the 'Beat it! Look', with only links that lead somewhere real.
test('pop-0.4 footer on home and lot pages; every link renders a real page; current year', async ({ page }) => {
  await login(page, 'alice');
  const lot = await createAuctionViaApi(page.request, { name: 'Footer lot' });
  await logout(page);

  for (const url of ['/', `/auctions/${lot.id}`]) {
    await page.goto(url);
    const footer = page.getByTestId('site-footer');
    await expect(footer).toBeVisible();
    await expect(footer.getByTestId('footer-copyright')).toHaveText(`© ${new Date().getFullYear()} Beat'em`);
    await expect(footer.getByTestId('footer-trust')).toContainText('Buyer protection');
    await expect(footer.getByTestId('footer-trust')).toContainText('Secure payments');
    expect(await footer.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(17, 17, 17)');
  }
  // No sound words in the footer (trust copy).
  await expect(page.getByTestId('site-footer')).not.toContainText(/POW!|BAM!|ZAP!|KAPOW!|GONE!/);

  const hrefs = await page.getByTestId('site-footer').locator('a').evaluateAll((as) => as.map((a) => a.getAttribute('href')!));
  expect(hrefs.length).toBeGreaterThanOrEqual(10);
  for (const href of [...new Set(hrefs)]) {
    await page.goto(href);
    // Guarded pages send guests to /login; either way a page renders, never the catch-all.
    await expect(page.locator('main')).not.toHaveText('Page not found.');
    await expect(page.locator('main h1, main h2').first()).toBeVisible();
  }
});

test('pop-0.4 footer columns stack at 375px without horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/');
  const cols = page.getByTestId('site-footer').locator('.footer-col');
  await expect(cols).toHaveCount(4);
  const xs = await cols.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
  expect(new Set(xs).size).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
