import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../be/src/db';
import { app, loginAs, resetDb } from '../../be/tests/helpers';

// rag-train-6: GET /api/rag/review and POST /api/rag/review/:id (permission rag.review, admin by default).
const TOKEN = 'test-internal-token-train6';

describe('rag-train-6 review queue', () => {
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
    const staff = await loginAs('staff');
    await staff.post('/api/rag/documents').set('X-Internal-Token', TOKEN).send({
      title: 'Fees', filename: 'f.md', mimeType: 'text/markdown', content: 'Fee 5%.', chunks: [{ text: 'Fee 5%.', embedding: [1, 0] }],
    });
    const chunkId = (await request(app).get('/api/rag/chunks').set('X-Internal-Token', TOKEN)).body[0].id;
    for (const q of ['Q1', 'Q2', 'Q3', 'Q4']) {
      const res = await request(app).post('/api/rag/turns').set('X-Internal-Token', TOKEN).send({
        visitor: 'r'.repeat(40), userText: q, botText: `A for ${q} [Fees]`, outcome: 'answered', model: 'm', promptVersion: 'p',
        retrievals: [{ chunkId, rank: 1, score: 0.8, cited: true }],
      });
      ids.push(res.body.turnId);
    }
    await request(app).put(`/api/rag/turns/${ids[0]}/feedback`).set('X-Internal-Token', TOKEN).send({ visitor: 'r'.repeat(40), feedback: 'down' });
  });
  afterAll(() => {
    process.env.RAG_INTERNAL_TOKEN = saved;
  });

  it('admin has rag.review; guests 401, customers and staff (not granted) 403', async () => {
    expect((await request(app).get('/api/rag/review')).status).toBe(401);
    expect((await (await loginAs('alice')).get('/api/rag/review')).status).toBe(403);
    expect((await (await loginAs('staff')).get('/api/rag/review')).status).toBe(403);
    expect((await (await loginAs('alice')).post(`/api/rag/review/${ids[0]}`).send({ decision: 'reject' })).status).toBe(403);
    expect((await admin.get('/api/auth/me')).body.user.permissions).toContain('rag.review');
  });

  it('lists raw turns newest first with feedback and retrieved chunks', async () => {
    const res = await admin.get('/api/rag/review');
    expect(res.status).toBe(200);
    expect(res.body.turns.map((t: { question: string }) => t.question)).toEqual(['Q4', 'Q3', 'Q2', 'Q1']);
    expect(res.body.turns[3]).toMatchObject({
      id: ids[0], user: null, reply: 'A for Q1 [Fees]', outcome: 'answered', feedback: 'down', review: null,
      chunks: [{ rank: 1, score: 0.8, cited: true, title: 'Fees', text: 'Fee 5%.' }],
    });
  });

  it('approve creates one approved example; reject sets rejected; reviewed turns leave the default list', async () => {
    const ok = await admin.post(`/api/rag/review/${ids[0]}`).send({ decision: 'approve', label: 'needs_fix', idealReply: 'The fee is 5% of the final price.' });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ turnId: ids[0], status: 'approved' });
    const adminId = (await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } })).id;
    expect(await prisma.ragExample.findMany({ where: { turnId: BigInt(ids[0]) } })).toEqual([
      expect.objectContaining({ status: 'approved', label: 'needs_fix', idealReply: 'The fee is 5% of the final price.', reviewerId: adminId }),
    ]);
    expect((await admin.post(`/api/rag/review/${ids[1]}`).send({ decision: 'reject' })).body.status).toBe('rejected');
    // A raw example row (made outside the queue) is still waiting
    await prisma.ragExample.create({ data: { turnId: BigInt(ids[2]) } });

    const waiting = (await admin.get('/api/rag/review')).body.turns.map((t: { id: number }) => t.id);
    expect(waiting).toEqual([ids[3], ids[2]]);
    const all = (await admin.get('/api/rag/review?all=1')).body.turns as { id: number; review: unknown }[];
    expect(all.find((t) => t.id === ids[0])!.review).toEqual({ status: 'approved', label: 'needs_fix', idealReply: 'The fee is 5% of the final price.' });

    expect((await admin.post(`/api/rag/review/${ids[2]}`).send({ decision: 'approve', label: 'good' })).status).toBe(200);
    expect(await prisma.ragExample.count({ where: { turnId: BigInt(ids[2]) } })).toBe(1);
  });

  it('refuses a second review, missing label or reply, and deleted or unknown turns', async () => {
    expect((await admin.post(`/api/rag/review/${ids[0]}`).send({ decision: 'reject' })).status).toBe(409);
    expect((await admin.post(`/api/rag/review/${ids[3]}`).send({ decision: 'approve' })).status).toBe(400);
    expect((await admin.post(`/api/rag/review/${ids[3]}`).send({ decision: 'approve', label: 'needs_fix' })).status).toBe(400);
    expect((await admin.post(`/api/rag/review/${ids[3]}`).send({ decision: 'maybe' })).status).toBe(400);
    expect((await admin.post('/api/rag/review/999999').send({ decision: 'reject' })).status).toBe(404);
    await prisma.ragTurn.update({ where: { id: BigInt(ids[3]) }, data: { deletedAt: new Date() } });
    expect((await admin.post(`/api/rag/review/${ids[3]}`).send({ decision: 'reject' })).status).toBe(404);
    expect((await admin.get('/api/rag/review?all=1')).body.turns.map((t: { id: number }) => t.id)).not.toContain(ids[3]);
  });
});
