import { expect, test } from '@playwright/test';
import { e2eDb, newVisitor } from './rag-db';

// rag-train-4: thumbs under a bot answer. Only the Gemini answer is faked: the /api/chat stub saves a real turn on
// the e2e API (as be/rag would) with the token the chat box sent, so the thumbs go Vite -> Flask -> Node -> Postgres.
const API = 'http://localhost:4100';
const TOKEN = 'e2e-internal-token'; // playwright.config.ts RAG_INTERNAL_TOKEN

test.afterAll(() => e2eDb.$disconnect());

test('rag-train-4: tap thumbs down, replace with up, still set after reload', async ({ page, playwright }) => {
  const api = await playwright.request.newContext({ baseURL: API, extraHTTPHeaders: { 'X-Internal-Token': TOKEN } });
  let turnId = 0;
  let visitor = '';
  await page.route('**/api/chat/health', (r) => r.fulfill({ json: { ok: true } }));
  await page.route('**/api/chat', async (route) => {
    const body = route.request().postDataJSON() as { messages: { text: string }[]; visitor: string };
    visitor = body.visitor;
    const saved = await api.post('/api/rag/turns', {
      data: { visitor, userText: body.messages.at(-1)!.text, botText: 'Five percent.', outcome: 'answered', model: 'stub', promptVersion: 'v' },
    });
    turnId = (await saved.json()).turnId;
    await route.fulfill({ json: { reply: 'Five percent.', turnId } });
  });

  await page.goto('/');
  await page.getByTestId('chat-toggle').click();
  await page.getByTestId('chat-input').fill('What is the fee?');
  await page.getByTestId('chat-send').click();
  const up = page.getByRole('button', { name: 'Helpful answer', exact: true });
  const down = page.getByRole('button', { name: 'Not helpful answer' });
  await expect(down).toBeVisible();
  for (const button of [up, down]) {
    const box = (await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  const feedback = async () => (await e2eDb.ragTurn.findUniqueOrThrow({ where: { id: BigInt(turnId) } })).feedback;

  await down.click();
  await expect(down).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(feedback).toBe('down');

  await up.click();
  await expect(up).toHaveAttribute('aria-pressed', 'true');
  await expect(down).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(feedback).toBe('up');

  await page.reload();
  await page.getByTestId('chat-toggle').click();
  await expect(page.getByRole('button', { name: 'Helpful answer', exact: true })).toHaveAttribute('aria-pressed', 'true');

  // Another visitor's token cannot rate this turn
  const other = await page.request.post('/api/chat/feedback', { data: { turnId, feedback: 'down', visitor: newVisitor() } });
  expect(other.status()).toBe(403);
  expect(await feedback()).toBe('up');
  expect((await page.request.post('/api/chat/feedback', { data: { turnId, feedback: 'down', visitor } })).status()).toBe(200);
});

test('rag-train-4: a refused save puts the thumbs back', async ({ page }) => {
  await page.route('**/api/chat/health', (r) => r.fulfill({ json: { ok: true } }));
  await page.route('**/api/chat', (r) => r.fulfill({ json: { reply: 'Hi!', turnId: 999999 } })); // no such turn: 404
  await page.goto('/');
  await page.getByTestId('chat-toggle').click();
  await page.getByTestId('chat-input').fill('Hello');
  await page.getByTestId('chat-send').click();
  const down = page.getByRole('button', { name: 'Not helpful answer' });
  await down.click();
  await expect(page.getByRole('alert')).toContainText('Your feedback was not saved');
  await expect(down).toHaveAttribute('aria-pressed', 'false');
});
