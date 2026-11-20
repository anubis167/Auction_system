import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../be/src/db';
import { app, loginAs, resetDb } from '../../be/tests/helpers';

// rag-train-3: chunk ids reach Python through /chunks; a turn write stores its retrievals.
const TOKEN = 'test-internal-token-train3';

describe('rag-train-3 retrievals', () => {
  const saved = process.env.RAG_INTERNAL_TOKEN;
  let staff: request.Agent;

  beforeAll(async () => {
    process.env.RAG_INTERNAL_TOKEN = TOKEN;
    await resetDb();
    await prisma.$executeRawUnsafe(
      'TRUNCATE rag_examples, rag_retrievals, rag_turns, rag_sessions, knowledge_chunks, knowledge_documents RESTART IDENTITY CASCADE',
    );
    staff = await loginAs('staff');
  });
  afterAll(() => {
    process.env.RAG_INTERNAL_TOKEN = saved;
  });

  it('GET /chunks carries each chunk id; a turn keeps rank, score and cited, readable after the document is deleted', async () => {
    const doc = await staff.post('/api/rag/documents').set('X-Internal-Token', TOKEN).send({
      title: 'Fees', filename: 'fees.md', mimeType: 'text/markdown', content: 'Fee 5%. Ship in 5 days.',
      chunks: [{ text: 'Fee 5%.', embedding: [1, 0] }, { text: 'Ship in 5 days.', embedding: [0, 1] }],
    });
    expect(doc.status).toBe(201);
    const chunks = (await request(app).get('/api/rag/chunks').set('X-Internal-Token', TOKEN)).body as { id: number; text: string }[];
    expect(chunks.map((c) => [typeof c.id, c.text])).toEqual([['number', 'Fee 5%.'], ['number', 'Ship in 5 days.']]);

    const res = await request(app).post('/api/rag/turns').set('X-Internal-Token', TOKEN).send({
      visitor: 'x'.repeat(32), userText: 'Fee?', botText: 'It is 5% [Fees].', outcome: 'answered', model: 'm', promptVersion: 'p',
      retrievals: [
        { chunkId: chunks[0].id, rank: 1, score: 0.91, cited: true },
        { chunkId: chunks[1].id, rank: 2, score: 0.64, cited: false },
      ],
    });
    expect(res.status).toBe(201);

    expect((await staff.delete(`/api/rag/documents/${doc.body.id}`)).status).toBe(204);
    expect((await request(app).get('/api/rag/chunks').set('X-Internal-Token', TOKEN)).body).toEqual([]);
    const rows = await prisma.ragRetrieval.findMany({
      where: { turnId: BigInt(res.body.turnId) },
      orderBy: { rank: 'asc' },
      include: { chunk: { include: { document: true } } },
    });
    expect(rows.map((r) => [r.rank, r.score, r.cited, r.chunk.text])).toEqual([[1, 0.91, true, 'Fee 5%.'], [2, 0.64, false, 'Ship in 5 days.']]);
    expect(rows[0].chunk.document.deletedAt).not.toBeNull();
  });

  it('a bad or unknown chunk fails the whole write, so no half-saved turn', async () => {
    const base = { visitor: 'y'.repeat(32), userText: 'Q', outcome: 'answered', model: 'm', promptVersion: 'p' };
    const before = await prisma.ragTurn.count();
    for (const retrievals of [[{ chunkId: 0, rank: 1, score: 1, cited: false }], [{ chunkId: 1, rank: 1, score: 'x', cited: false }]]) {
      expect((await request(app).post('/api/rag/turns').set('X-Internal-Token', TOKEN).send({ ...base, retrievals })).status).toBe(400);
    }
    const unknown = await request(app).post('/api/rag/turns').set('X-Internal-Token', TOKEN)
      .send({ ...base, retrievals: [{ chunkId: 999999, rank: 1, score: 1, cited: false }] });
    expect(unknown.status).toBe(400);
    expect(await prisma.ragTurn.count()).toBe(before);
  });
});
