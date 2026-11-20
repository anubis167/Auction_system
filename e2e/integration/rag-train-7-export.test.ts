import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../be/src/db';
import { app, loginAs, resetDb } from '../../be/tests/helpers';

// rag-train-7: GET /api/rag/examples/export (rag.review).
const TOKEN = 'test-internal-token-train7';

describe('rag-train-7 export', () => {
  const saved = process.env.RAG_INTERNAL_TOKEN;
  let admin: request.Agent;
  const ids: number[] = [];

  beforeAll(async () => {
    process.env.RAG_INTERNAL_TOKEN = TOKEN;
    await resetDb();
    await prisma.$executeRawUnsafe(
      'TRUNCATE rag_examples, rag_retrievals, rag_turns, rag_sessions, knowledge_chunks, knowledge_documents RESTART IDENTITY CASCADE',
    );
    admin = await loginAs('admin');
    const alice = await loginAs('alice');
    const staff = await loginAs('staff');
    await staff.post('/api/rag/documents').set('X-Internal-Token', TOKEN).send({
      title: 'Fees', filename: 'f.md', mimeType: 'text/markdown', content: 'x',
      chunks: [{ text: 'Fee 5%.', embedding: [1, 0] }, { text: 'Paid at close.', embedding: [0, 1] }],
    });
    const chunks = (await request(app).get('/api/rag/chunks').set('X-Internal-Token', TOKEN)).body as { id: number }[];
    for (const q of ['Q1', 'Q2', 'Q3']) {
      const res = await alice.post('/api/rag/turns').set('X-Internal-Token', TOKEN).send({
        visitor: 'e'.repeat(40), userText: q, botText: `A${q}`, outcome: 'answered', model: 'm', promptVersion: 'p',
        retrievals: chunks.map((c, i) => ({ chunkId: c.id, rank: i + 1, score: 0.9 - i / 10, cited: i === 0 })),
      });
      ids.push(res.body.turnId);
    }
    await admin.post(`/api/rag/review/${ids[0]}`).send({ decision: 'approve', label: 'needs_fix', idealReply: 'Better A1' });
    await admin.post(`/api/rag/review/${ids[1]}`).send({ decision: 'reject' });
    await admin.post(`/api/rag/review/${ids[2]}`).send({ decision: 'approve', label: 'good' });
  });
  afterAll(() => {
    process.env.RAG_INTERNAL_TOKEN = saved;
  });

  it('needs rag.review', async () => {
    expect((await request(app).get('/api/rag/examples/export')).status).toBe(401);
    expect((await (await loginAs('alice')).get('/api/rag/examples/export')).status).toBe(403);
    expect(await prisma.ragExample.count({ where: { status: 'exported' } })).toBe(0);
  });

  it('downloads approved examples only, without personal data, then marks them exported; a second run is empty', async () => {
    const res = await admin.get('/api/rag/examples/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/x-ndjson');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="rag-examples-\d{4}-\d{2}-\d{2}\.jsonl"$/);
    const lines = res.text.trim().split('\n').map((l) => JSON.parse(l));
    expect(lines).toEqual([
      { question: 'Q1', chunks: ['Fee 5%.', 'Paid at close.'], reply: 'AQ1', idealReply: 'Better A1', label: 'needs_fix' },
      { question: 'Q3', chunks: ['Fee 5%.', 'Paid at close.'], reply: 'AQ3', idealReply: null, label: 'good' },
    ]);
    const alice = await prisma.user.findUniqueOrThrow({ where: { username: 'alice' } });
    const session = await prisma.ragSession.findFirstOrThrow();
    for (const leak of ['alice', alice.email, session.visitorHash, 'userId', 'user_id', 'visitor']) expect(res.text).not.toContain(leak);

    const rows = await prisma.ragExample.findMany({ orderBy: { turnId: 'asc' } });
    expect(rows.map((r) => [r.status, r.exportedAt !== null])).toEqual([['exported', true], ['rejected', false], ['exported', true]]);

    const again = await admin.get('/api/rag/examples/export');
    expect(again.status).toBe(200);
    expect(again.text).toBe('');
    expect(await prisma.ragExample.count({ where: { status: 'exported' } })).toBe(2);
  });

  it('two exports at once never put one example in both files', async () => {
    const turn = await prisma.ragTurn.findUniqueOrThrow({ where: { id: BigInt(ids[1]) } });
    await prisma.ragExample.update({ where: { turnId: turn.id }, data: { status: 'approved', label: 'bad' } });
    const [a, b] = await Promise.all([admin.get('/api/rag/examples/export'), admin.get('/api/rag/examples/export')]);
    expect([a.text, b.text].filter((t) => t.includes('"question":"Q2"'))).toHaveLength(1);
  });
});
