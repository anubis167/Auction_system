import { expect, test } from '@playwright/test';

// pop-1.3: How it works (Spot it! Bid it! Win it!), true to the site's rules.
test('pop-1.3 hero button scrolls to three steps with no watchlist or auto-bid copy', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const section = page.getByTestId('how-it-works');
  await page.getByTestId('hero').getByRole('link', { name: 'How it works' }).click();
  await expect(page).toHaveURL(/#how-it-works$/);
  await expect(section.getByRole('heading', { name: 'How it works' })).toBeInViewport();
  await expect(section.getByRole('heading', { level: 3 })).toHaveText(['Spot it!', 'Bid it!', 'Win it!']);
  await expect(section).toContainText('credit');
  await expect(section).not.toContainText(/watchlist|auto-bid/i);
});
