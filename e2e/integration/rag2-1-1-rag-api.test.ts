import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../be/src/db';
import { app, createAuction, loginAs, resetDb } from '../../be/tests/helpers';
import { MAX_CHUNKS } from '../../be/src/routes/rag';

// rag2-1.1: the Node routes the Python RAG service uses instead of reading the database itself.
const TOKEN = 'test-internal-token-rag2';
const doc = (over: Record<string, unknown> = {}) => ({
  title: 'Fees',
  filename: 'fees.md',
  mimeType: 'text/markdown',
  content: 'The seller fee is 5%.',
  chunks: [{ text: 'The seller fee is 5%.', embedding: [1, 0, 0] }],
  ...over,
});

describe('rag2-1.1 /api/rag routes', () => {
  let alice: request.Agent;
  let staff: request.Agent;
  let admin: request.Agent;
  const saved = process.env.RAG_INTERNAL_TOKEN;

  beforeAll(async () => {
    process.env.RAG_INTERNAL_TOKEN = TOKEN;
    await resetDb();
    await prisma.$executeRawUnsafe('TRUNCATE knowledge_chunks, knowledge_documents RESTART IDENTITY CASCADE');
    alice = await loginAs('alice');
    staff = await loginAs('staff');
    admin = await loginAs('admin');
  });
  afterAll(() => {
    process.env.RAG_INTERNAL_TOKEN = saved;
  });

  it('GET /me: own account only, guests 401', async () => {
    expect((await request(app).get('/api/rag/me')).status).toBe(401);
    const bob = await loginAs('bob');
    const lot = await createAuction(alice, { name: 'Alice lamp', initialPrice: 100 });
    expect((await bob.post(`/api/auctions/${lot.id}/bids`).send({ amount: 100 })).status).toBe(201);

    const me = await alice.get('/api/rag/me');
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ role: 'customer', username: 'alice' });
    expect(typeof me.body.id).toBe('number');
    expect(me.body.credit).toEqual({
      balance: expect.stringMatching(/^\d+\.\d\d$/),
      held: expect.stringMatching(/^\d+\.\d\d$/),
      available: expect.stringMatching(/^\d+\.\d\d$/),
    });
    expect(me.body.lots).toContainEqual(expect.objectContaining({ name: 'Alice lamp', price: '100.00' }));
    expect(me.body.bids.some((b: { auction: string }) => b.auction === 'Alice lamp')).toBe(false); // bob's bid, not hers

    const bobMe = await bob.get('/api/rag/me');
    expect(bobMe.body.bids).toContainEqual({ auction: 'Alice lamp', amount: '100.00', status: expect.any(String) });
    expect(bobMe.body.lots).toEqual([]);
  });

  it('internal token: missing or wrong 401, unset 503, never accepted from a cookie user alone', async () => {
    expect((await request(app).get('/api/rag/chunks')).status).toBe(401);
    expect((await request(app).get('/api/rag/chunks').set('X-Internal-Token', 'wrong')).status).toBe(401);
    expect((await staff.get('/api/rag/chunks')).status).toBe(401);
    expect((await staff.post('/api/rag/documents').send(doc())).status).toBe(401);
    process.env.RAG_INTERNAL_TOKEN = '';
    expect((await request(app).get('/api/rag/chunks').set('X-Internal-Token', '')).status).toBe(503);
    process.env.RAG_INTERNAL_TOKEN = TOKEN;
  });

  it('documents need knowledge.manage: guests 401, customers 403', async () => {
    expect((await request(app).get('/api/rag/documents')).status).toBe(401);
    expect((await alice.get('/api/rag/documents')).status).toBe(403);
    expect((await alice.delete('/api/rag/documents/1')).status).toBe(403);
    expect((await alice.post('/api/rag/documents').set('X-Internal-Token', TOKEN).send(doc())).status).toBe(403);
    expect((await request(app).post('/api/rag/documents').set('X-Internal-Token', TOKEN).send(doc())).status).toBe(401);
  });

  it('validates the document body', async () => {
    // One chunk over the route's limit (raised with the 10 MB upload limit, docs/changes/merge-rag2-rag3.md).
    const big = Array(MAX_CHUNKS + 1).fill({ text: 'a', embedding: [1] });
    for (const body of [
      doc({ title: ' ' }),
      doc({ mimeType: 'text/html' }),
      doc({ chunks: [] }),
      doc({ chunks: big }),
      doc({ chunks: [{ text: 'a', embedding: [] }] }),
      doc({ chunks: [{ text: 'a', embedding: ['1'] }] }),
      doc({ chunks: [{ text: 'a'.repeat(1001), embedding: [1] }] }),
      doc({ content: '' }),
    ]) {
      expect((await staff.post('/api/rag/documents').set('X-Internal-Token', TOKEN).send(body)).status).toBe(400);
    }
    expect(await prisma.knowledgeDocument.count()).toBe(0);
  });

  it('accepts a real-size upload with the token; without it the body is never read', async () => {
    const vector = Array.from({ length: 768 }, (_, i) => Math.sin(i) * 0.0123456789);
    const chunks = Array.from({ length: 60 }, (_, i) => ({ text: `chunk ${i} ` + 'x'.repeat(900), embedding: vector }));
    const res = await staff.post('/api/rag/documents').set('X-Internal-Token', TOKEN).send(doc({ title: 'Big', chunks }));
    expect(res.status).toBe(201);
    expect(res.body.chunks).toBe(60);
    expect((await staff.post('/api/rag/documents').send(doc({ title: 'Big', chunks }))).status).toBe(401);
    expect((await staff.delete(`/api/rag/documents/${res.body.id}`)).status).toBe(204);
  });

  it('save, list, chunks, soft delete', async () => {
    const created = await staff.post('/api/rag/documents').set('X-Internal-Token', TOKEN).send(
      doc({ chunks: [{ text: 'one', embedding: [1, 0] }, { text: 'two', embedding: [0, 1] }] }),
    );
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ id: expect.any(Number), title: 'Fees', chunks: 2 });
    const second = await admin.post('/api/rag/documents').set('X-Internal-Token', TOKEN).send(doc({ title: 'Shipping' }));
    expect(second.status).toBe(201);

    const list = await staff.get('/api/rag/documents');
    expect(list.body.documents.map((d: { title: string }) => d.title)).toEqual(['Shipping', 'Fees']);
    expect(list.body.documents[1]).toMatchObject({ filename: 'fees.md', sizeBytes: 21, chunks: 2 });

    const chunks = await request(app).get('/api/rag/chunks').set('X-Internal-Token', TOKEN);
    expect(chunks.status).toBe(200);
    expect(chunks.body).toContainEqual({ id: expect.any(Number), title: 'Fees', text: 'one', embedding: [1, 0] });
    expect(chunks.body).toHaveLength(3);

    expect((await staff.delete(`/api/rag/documents/${created.body.id}`)).status).toBe(204);
    expect((await staff.delete(`/api/rag/documents/${created.body.id}`)).status).toBe(404);
    expect((await staff.delete('/api/rag/documents/abc')).status).toBe(404);
    const after = await request(app).get('/api/rag/chunks').set('X-Internal-Token', TOKEN);
    expect(after.body.map((c: { title: string }) => c.title)).toEqual(['Shipping']);
    expect((await staff.get('/api/rag/documents')).body.documents).toHaveLength(1);
    // Soft delete: the row is still there
    expect(await prisma.knowledgeDocument.findUnique({ where: { id: BigInt(created.body.id) } })).toMatchObject({
      deletedAt: expect.any(Date),
    });
  });
});
