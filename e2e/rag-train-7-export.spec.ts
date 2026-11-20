import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { login } from './helpers';
import { e2eDb, newVisitor } from './rag-db';

// rag-train-7: the admin downloads approved examples from /admin/rag-review as a JSONL file.
const API = 'http://localhost:4100';
const TOKEN = 'e2e-internal-token'; // playwright.config.ts RAG_INTERNAL_TOKEN

test.afterAll(() => e2eDb.$disconnect());

test('rag-train-7: download approved examples, marked exported, not exported twice', async ({ page, playwright }) => {
  const internal = await playwright.request.newContext({ baseURL: API, extraHTTPHeaders: { 'X-Internal-Token': TOKEN } });
  const question = `Export me ${Date.now()}?`;
  const res = await internal.post('/api/rag/turns', {
    data: { visitor: newVisitor(), userText: question, botText: 'Bot answer', outcome: 'answered', model: 'stub', promptVersion: 'v' },
  });
  const turnId = BigInt((await res.json()).turnId);

  await login(page, 'admin');
  expect((await page.request.post(`/api/rag/review/${turnId}`, { data: { decision: 'approve', label: 'good' } })).status()).toBe(200);
  await page.goto('/admin/rag-review');

  const download = page.waitForEvent('download');
  await page.getByTestId('rag-export').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^rag-examples-\d{4}-\d{2}-\d{2}\.jsonl$/);
  const lines = (await readFile((await file.path())!, 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
  const mine = lines.find((l) => l.question === question);
  expect(mine).toEqual({ question, chunks: [], reply: 'Bot answer', idealReply: null, label: 'good' });
  for (const line of lines) expect(Object.keys(line).sort()).toEqual(['chunks', 'idealReply', 'label', 'question', 'reply']);

  const example = await e2eDb.ragExample.findUniqueOrThrow({ where: { turnId } });
  expect(example.status).toBe('exported');
  expect(example.exportedAt).not.toBeNull();

  const again = await page.request.get('/api/rag/examples/export');
  expect(again.status()).toBe(200);
  expect(await again.text()).not.toContain(question);
});
