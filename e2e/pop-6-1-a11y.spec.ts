import { expect, test, type Page } from '@playwright/test';
import { createAuctionViaApi, login, logout } from './helpers';

// pop-6.1: accessibility gate over home, lot, chat and auth pages.
const CONTROLS = 'button, input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea, a.btn, nav a, [role="tab"]';

/** Tabs through the page; every stop shows the 3px bam-blue ring with a 3px offset. Returns the number of stops. */
async function tabRing(page: Page, stops = 30) {
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  const seen: string[] = [];
  for (let i = 0; i < stops; i++) {
    await page.keyboard.press('Tab');
    const ring = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      return { what: `${el.tagName} ${(el.textContent ?? el.getAttribute('aria-label') ?? '').trim().slice(0, 30)}`, ring: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor} ${s.outlineOffset}` };
    });
    if (!ring) continue;
    expect(ring.ring, ring.what).toBe('solid 3px rgb(29, 78, 216) 3px');
    seen.push(ring.what);
  }
  return seen.length;
}

/** Every visible control in the header, main and chat is at least 44px tall and wide at 375px. */
async function targets(page: Page) {
  const small = await page.locator(`header ${CONTROLS}, main ${CONTROLS}, .chat ${CONTROLS}`).evaluateAll((els) =>
    els
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && !el.closest('[hidden]') && !el.classList.contains('sr-only') && !el.closest('.sr-only');
      })
      .map((el) => ({ el: `${el.tagName}.${el.className} "${(el.textContent ?? '').trim().slice(0, 24)}"`, h: Math.round(el.getBoundingClientRect().height), w: Math.round(el.getBoundingClientRect().width) }))
      .filter((t) => t.h < 44 || t.w < 44),
  );
  expect(small).toEqual([]);
}

test('pop-6.1 focus ring on every tab stop: home, lot, auth pages, chat', async ({ page }) => {
  await login(page, 'alice');
  const lot = await createAuctionViaApi(page.request, { name: 'A11y Lamp' });
  await logout(page);
  await page.route('**/api/chat/health', (r) => r.fulfill({ json: { ok: true } }));
  for (const url of ['/', `/auctions/${lot.id}`, '/login', '/register', '/forgot-password']) {
    await page.goto(url);
    expect(await tabRing(page), url).toBeGreaterThan(5);
  }
  // Chat widget controls.
  await page.goto('/');
  await page.getByTestId('chat-toggle').click();
  await page.getByTestId('chat-input').focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  const s = await page.getByTestId('chat-input').evaluate((el) => getComputedStyle(el).outlineColor);
  expect(s).toBe('rgb(29, 78, 216)');
});

test('pop-6.1 touch targets >= 44px at 375px on home, lot, chat and auth pages', async ({ page }) => {
  await login(page, 'alice');
  const lot = await createAuctionViaApi(page.request, { name: 'Thumb Lamp' });
  await logout(page);
  await page.route('**/api/chat/health', (r) => r.fulfill({ json: { ok: true } }));
  await page.setViewportSize({ width: 375, height: 812 });
  for (const url of ['/', `/auctions/${lot.id}`, '/login', '/register', '/forgot-password']) {
    await page.goto(url);
    await expect(page.locator('main h1').first()).toBeVisible();
    await targets(page);
  }
  await page.goto('/');
  await page.getByTestId('chat-toggle').click();
  await expect(page.getByTestId('chat-panel')).toBeVisible();
  await targets(page);
  // Signed-in lot page (bid form, quick bids, phone band).
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page, 'bob');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/auctions/${lot.id}`);
  await expect(page.getByTestId('bid-band')).toBeVisible();
  await targets(page);
});

test('pop-6.1 colour never carries meaning alone: Live has dot + word, ending soon has the word', async ({ page }) => {
  await login(page, 'alice');
  const lot = await createAuctionViaApi(page.request, { name: 'Word Lamp' });
  await logout(page);
  await page.goto(`/?q=${encodeURIComponent('Word Lamp')}`);
  const card = page.getByTestId(`auction-card-${lot.id}`);
  const live = card.locator('.pop-badge-live');
  await expect(live).toHaveText('Live');
  await expect(live.locator('.pop-badge-dot')).toHaveCount(1);
  await expect(card.getByTestId('ending-soon')).toHaveText('Ending soon!');
});
