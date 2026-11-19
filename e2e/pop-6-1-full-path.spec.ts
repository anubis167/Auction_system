import { expect, request as playwrightRequest, test } from '@playwright/test';
import { PASSWORD, createAuctionViaApi, topUpViaApi } from './helpers';

// pop-6.1: the whole buy path on the rebranded site, with each sound word at its one moment.
test('pop-6.1 guest -> register (KAPOW!) -> credit approved by staff -> bid (POW!) -> win (BAM!) -> lot GONE!', async ({ page, baseURL }) => {
  const username = `path${Date.now().toString(36)}`;
  const email = `${username}@example.com`;
  await page.setViewportSize({ width: 1280, height: 900 });

  // 1. Guest home -> Register (header) -> KAPOW! on the sign-in page.
  await page.goto('/');
  await expect(page.getByTestId('hero')).toBeVisible();
  await page.locator('header').getByRole('link', { name: 'Register' }).click();
  await page.getByLabel('Full name').fill('Path Walker');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Phone').fill('0900000000');
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByTestId('kapow').getByRole('status')).toHaveText('KAPOW!');

  // 2. The activation mail signs the new customer in (mail-002).
  const { mails } = await (await page.request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
  const link = new URL(mails[0].text.match(/https?:\/\/\S+verify-email\?token=\w+/)[0]);
  await page.goto(link.pathname + link.search);
  await expect(page.getByTestId('current-user')).toHaveText(username);

  // 3. Credit top-up request approved by staff (stf-007), visible in the header bid limit.
  await topUpViaApi(page.request, 500);
  await page.reload();
  await expect(page.getByTestId('bid-limit')).toHaveText('$500.00');

  // 4. A seller lists a lot; the customer bids from the lot page: POW!
  const seller = await playwrightRequest.newContext({ baseURL });
  expect((await seller.post('/api/auth/login', { data: { identifier: 'alice', password: PASSWORD } })).status()).toBe(200);
  const lot = await createAuctionViaApi(seller, { name: `Path Gramophone ${username}`, initialPrice: 120 });
  await seller.dispose();
  await page.goto(`/auctions/${lot.id}`);
  await page.getByTestId('place-bid').click();
  await expect(page.getByTestId('pow-burst')).toHaveText('POW!');
  await expect(page.getByTestId('bid-ok')).toHaveText("You're the top bidder!");
  await expect(page.getByTestId('bid-limit')).toHaveText('$380.00');

  // 5. The hammer drops (dev expire + close job): settlement, BAM! in My biddings.
  await page.request.post(`/api/dev/auctions/${lot.id}/expire`);
  await expect.poll(async () => (await (await page.request.get(`/api/dev/auctions/${lot.id}/raw`)).json()).status).toBe('ended');
  await page.goto('/my-bids');
  const row = page.getByTestId('my-bids').getByRole('row').filter({ hasText: lot.name });
  await expect(row.getByTestId('my-status')).toHaveText('Won');
  await expect(row.getByTestId('won-bam')).toHaveText('BAM!');

  // 6. The lot page now says GONE! and names the winner.
  await page.goto(`/auctions/${lot.id}`);
  await expect(page.getByTestId('lot-badge-gone')).toHaveText('GONE!');
  await expect(page.getByTestId('winner')).toHaveText(username);
  await expect(page.getByText('This auction has ended and no longer accepts bids.')).toBeVisible();
});
