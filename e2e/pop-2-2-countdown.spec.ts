import { expect, test } from '@playwright/test';
import { createAuctionViaApi, login, logout } from './helpers';

// pop-2.2: comic Countdown panel (role=timer, aria-live=off) with polite 5-minute / 1-minute announcements.
test('pop-2.2 timer role, ticking digits in comic boxes, shadow-red panel', async ({ page }) => {
  await login(page, 'alice');
  const lot = await createAuctionViaApi(page.request, { name: 'Clock Radio' });
  await logout(page);
  await page.goto(`/auctions/${lot.id}`);
  const timer = page.getByRole('timer');
  await expect(timer).toHaveAttribute('aria-live', 'off');
  await expect(timer).toHaveText(/^Ends in \d+m \d+s$/);
  await expect(page.getByTestId('cd-hours')).toHaveText(/^00Hrs$/);
  const before = await page.getByTestId('cd-seconds').textContent();
  await expect(page.getByTestId('cd-seconds')).not.toHaveText(before!, { timeout: 3000 });
  const panel = page.getByTestId('countdown-panel');
  expect(await panel.evaluate((el) => getComputedStyle(el).boxShadow)).toBe('rgb(214, 40, 40) 8px 8px 0px 0px');
  // No mark crossed yet: the polite region is empty.
  await expect(page.getByTestId('countdown-announce')).toHaveText('');
});

test('pop-2.2 a lot under five minutes announces it once, then the one-minute mark', async ({ page }) => {
  await login(page, 'alice');
  const lot = await createAuctionViaApi(page.request, { name: 'Egg Timer' });
  const { auction } = await (await page.request.get(`/api/auctions/${lot.id}`)).json();
  await logout(page);
  // The browser clock jumps to 4 minutes before the server end time (the page counts down from the API's end time).
  const end = new Date(auction.endTime).getTime();
  await page.clock.install({ time: end - 4 * 60_000 });
  await page.goto(`/auctions/${lot.id}`);
  const announce = page.getByTestId('countdown-announce');
  await expect(announce).toHaveAttribute('aria-live', 'polite');
  await expect(announce).toHaveText('5 minutes left');
  await expect(page.getByTestId('cd-minutes')).toHaveText(/^0[34]Min$/);
  await page.clock.fastForward('03:05');
  await expect(announce).toHaveText('1 minute left');
  await expect(page.getByTestId('cd-minutes')).toHaveText('00Min');
});
