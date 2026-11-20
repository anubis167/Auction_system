import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../be/src/db';
import { app, resetDb } from '../../be/tests/helpers';

// rag-train-4: PUT /api/rag/turns/:id/feedback, relayed by be/rag from the chat box's thumbs.
const TOKEN = 'test-internal-token-train4';
const OWNER = 'o'.repeat(40);
const put = (id: number | string, body: Record<string, unknown>, token = TOKEN) =>
  request(app).put(`/api/rag/turns/${id}/feedback`).set('X-Internal-Token', token).send(body);

describe('rag-train-4 turn feedback', () => {
  const saved = process.env.RAG_INTERNAL_TOKEN;
  let turnId: number;

  beforeAll(async () => {
    process.env.RAG_INTERNAL_TOKEN = TOKEN;
    await resetDb();
    await prisma.$executeRawUnsafe('TRUNCATE rag_examples, rag_retrievals, rag_turns, rag_sessions RESTART IDENTITY CASCADE');
    const res = await request(app).post('/api/rag/turns').set('X-Internal-Token', TOKEN)
      .send({ visitor: OWNER, userText: 'Fee?', botText: '5%', outcome: 'answered', model: 'm', promptVersion: 'p' });
    turnId = res.body.turnId;
  });
  afterAll(() => {
    process.env.RAG_INTERNAL_TOKEN = saved;
  });

  const feedbackOf = async () => (await prisma.ragTurn.findUniqueOrThrow({ where: { id: BigInt(turnId) } })).feedback;

  it('the owner sets thumbs down, then up replaces it', async () => {
    expect(await feedbackOf()).toBeNull();
    const down = await put(turnId, { visitor: OWNER, feedback: 'down' });
    expect(down.status).toBe(200);
    expect(down.body).toEqual({ turnId, feedback: 'down' });
    expect(await feedbackOf()).toBe('down');
    expect((await put(turnId, { visitor: OWNER, feedback: 'up' })).status).toBe(200);
    expect(await feedbackOf()).toBe('up');
  });

  it("another visitor gets 403 and the feedback is unchanged", async () => {
    const res = await put(turnId, { visitor: 'x'.repeat(40), feedback: 'down' });
    expect(res.status).toBe(403);
    expect(await feedbackOf()).toBe('up');
  });

  it('bad body 400, unknown or deleted turn 404, no service token 401', async () => {
    expect((await put(turnId, { visitor: OWNER, feedback: 'meh' })).status).toBe(400);
    expect((await put(turnId, { feedback: 'up' })).status).toBe(400);
    expect((await put(999999, { visitor: OWNER, feedback: 'up' })).status).toBe(404);
    expect((await put('abc', { visitor: OWNER, feedback: 'up' })).status).toBe(404);
    expect((await put(turnId, { visitor: OWNER, feedback: 'down' }, 'wrong')).status).toBe(401);
    await prisma.ragTurn.update({ where: { id: BigInt(turnId) }, data: { deletedAt: new Date() } });
    expect((await put(turnId, { visitor: OWNER, feedback: 'down' })).status).toBe(404);
    expect(await feedbackOf()).toBe('up');
  });
});
