import { expect, test } from '@playwright/test';

// pop-0.1: the 'Beat it! Look' base styles reach the rendered page.
test('pop-0.1 paper ground, Archivo body, Bangers headings, blue focus ring', async ({ page }) => {
  await page.goto('/login');
  const body = await page.evaluate(() => {
    const s = getComputedStyle(document.body);
    return { bg: s.backgroundColor, font: s.fontFamily, color: s.color };
  });
  expect(body.bg).toBe('rgb(255, 248, 231)');
  expect(body.color).toBe('rgb(17, 17, 17)');
  expect(body.font.replace(/"/g, '')).toMatch(/^Archivo/);
  const h1 = await page.locator('h1').first().evaluate((el) => getComputedStyle(el).fontFamily);
  expect(h1.replace(/"/g, '')).toMatch(/^Bangers/);

  // Tab until a button has focus; its ring is 3px solid bam-blue.
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(() => document.activeElement?.tagName === 'BUTTON')) break;
  }
  const ring = await page.evaluate(() => {
    const s = getComputedStyle(document.activeElement!);
    return { tag: document.activeElement!.tagName, style: s.outlineStyle, width: s.outlineWidth, color: s.outlineColor, offset: s.outlineOffset };
  });
  expect(ring).toEqual({ tag: 'BUTTON', style: 'solid', width: '3px', color: 'rgb(29, 78, 216)', offset: '3px' });

  // Buttons are square with a 3px ink outline.
  const btn = await page.getByRole('button', { name: 'Log in' }).evaluate((el) => {
    const s = getComputedStyle(el);
    return { radius: s.borderTopLeftRadius, border: s.borderTopWidth, borderColor: s.borderTopColor };
  });
  expect(btn).toEqual({ radius: '0px', border: '3px', borderColor: 'rgb(17, 17, 17)' });
});

test('pop-0.1 reduced motion turns transitions off', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/login');
  const d = await page.getByRole('button', { name: 'Log in' }).evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(d).toBe('0s');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload();
  const on = await page.getByRole('button', { name: 'Log in' }).evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(on).not.toBe('0s');
});
