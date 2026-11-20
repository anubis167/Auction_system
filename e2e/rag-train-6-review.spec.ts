import { expect, test } from '@playwright/test';
import { login, PASSWORD } from './helpers';
import { e2eDb, newVisitor } from './rag-db';

// rag-train-6: the admin labels saved turns on /admin/rag-review and approves or rejects them.
const API = 'http://localhost:4100';
const TOKEN = 'e2e-internal-token'; // playwright.config.ts RAG_INTERNAL_TOKEN

test.afterAll(() => e2eDb.$disconnect());

test('rag-train-6: approve and reject from the review queue; customers get 403', async ({ page, playwright }) => {
  const internal = await playwright.request.newContext({ baseURL: API, extraHTTPHeaders: { 'X-Internal-Token': TOKEN } });
  const stamp = Date.now();
  const visitor = newVisitor();
  const ids: number[] = [];
  for (const q of [`Approve me ${stamp}?`, `Reject me ${stamp}?`]) {
    const res = await internal.post('/api/rag/turns', {
      data: { visitor, userText: q, botText: `Answer to ${q}`, outcome: 'answered', model: 'stub', promptVersion: 'v' },
    });
    ids.push((await res.json()).turnId);
  }

  await login(page, 'admin');
  await page.goto('/admin/rag-review');
  await expect(page.getByRole('heading', { name: 'Bot review' })).toBeVisible();

  const first = page.getByRole('article', { name: `Approve me ${stamp}?` });
  await expect(first).toContainText(`Answer to Approve me ${stamp}?`);
  await expect(first.getByRole('button', { name: 'Approve' })).toBeDisabled(); // a label first
  await first.getByLabel('Label').selectOption('needs_fix');
  await first.getByLabel(/Better reply/).fill('A clearer answer.');
  await first.getByRole('button', { name: 'Approve' }).click();
  await expect(first).toHaveCount(0);

  const second = page.getByRole('article', { name: `Reject me ${stamp}?` });
  await second.getByRole('button', { name: 'Reject' }).click();
  await expect(second).toHaveCount(0);

  const examples = await e2eDb.ragExample.findMany({ where: { turnId: { in: ids.map(BigInt) } }, orderBy: { turnId: 'asc' } });
  expect(examples.map((e) => [e.status, e.label, e.idealReply])).toEqual([
    ['approved', 'needs_fix', 'A clearer answer.'],
    ['rejected', null, null],
  ]);

  // Reviewed turns are not listed again
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Bot review' })).toBeVisible();
  await expect(page.getByRole('article', { name: `Approve me ${stamp}?` })).toHaveCount(0);

  const customer = await playwright.request.newContext();
  expect((await customer.post('/api/auth/login', { data: { identifier: 'alice', password: PASSWORD } })).status()).toBe(200);
  expect((await customer.get('/api/rag/review')).status()).toBe(403);
  expect((await customer.post(`/api/rag/review/${ids[0]}`, { data: { decision: 'reject' } })).status()).toBe(403);
});
