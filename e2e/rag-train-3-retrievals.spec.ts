import { expect, test } from '@playwright/test';
import { PASSWORD } from './helpers';
import { e2eDb, newVisitor, turnsOf } from './rag-db';

// rag-train-3: one saved turn with two retrieved chunks, written to the running e2e API the way be/rag does it
// (X-Internal-Token), then the document is soft-deleted and the rows are still readable.
const API = 'http://localhost:4100';
const TOKEN = 'e2e-internal-token'; // playwright.config.ts RAG_INTERNAL_TOKEN

test.afterAll(() => e2eDb.$disconnect());

test('rag-train-3: a turn keeps its two chunks, rank, score and cited flag', async ({ playwright }) => {
  const staff = await playwright.request.newContext({ baseURL: API, extraHTTPHeaders: { 'X-Internal-Token': TOKEN } });
  expect((await staff.post('/api/auth/login', { data: { identifier: 'staff', password: PASSWORD } })).status()).toBe(200);
  const title = `Fees ${Date.now()}`;
  const doc = await staff.post('/api/rag/documents', {
    data: {
      title, filename: 'fees.md', mimeType: 'text/markdown', content: 'Fee is 5%. Ship in 5 days.',
      chunks: [{ text: 'Fee is 5%.', embedding: [1, 0] }, { text: 'Ship in 5 days.', embedding: [0, 1] }],
    },
  });
  expect(doc.status(), await doc.text()).toBe(201);
  const chunks = ((await (await staff.get('/api/rag/chunks')).json()) as { id: number; title: string }[]).filter((c) => c.title === title);
  expect(chunks).toHaveLength(2);

  const visitor = newVisitor();
  const turn = await staff.post('/api/rag/turns', {
    data: {
      visitor, userText: 'What is the fee?', botText: `It is 5% [${title}].`, outcome: 'answered', model: 'gemini-test', promptVersion: 'v1',
      retrievals: [
        { chunkId: chunks[0].id, rank: 1, score: 0.88, cited: true },
        { chunkId: chunks[1].id, rank: 2, score: 0.61, cited: false },
      ],
    },
  });
  expect(turn.status(), await turn.text()).toBe(201);
  expect((await staff.delete(`/api/rag/documents/${(await doc.json()).id}`)).status()).toBe(204);

  const [saved] = await turnsOf(visitor);
  const rows = await e2eDb.ragRetrieval.findMany({ where: { turnId: saved.id }, orderBy: { rank: 'asc' }, include: { chunk: true } });
  expect(rows.map((r) => [r.rank, r.score, r.cited, r.chunk.text])).toEqual([
    [1, 0.88, true, 'Fee is 5%.'],
    [2, 0.61, false, 'Ship in 5 days.'],
  ]);
});
