import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../be/src/db';
import { visitorHash } from '../../be/src/routes/rag';
import { app, loginAs, resetDb } from '../../be/tests/helpers';

// rag-train-2: POST /api/rag/turns, the Python service's write of one chat turn.
const TOKEN = 'test-internal-token-train2';
const VISITOR = 'v'.repeat(40);
const turn = (over: Record<string, unknown> = {}) => ({
  visitor: VISITOR,
  userText: 'What is the fee?',
  botText: 'The fee is 5%.',
  outcome: 'answered',
  model: 'gemini-test',
  promptVersion: 'a'.repeat(64),
  promptTokens: 120,
  completionTokens: 30,
  latencyMs: 850,
  ...over,
});

describe('rag-train-2 POST /api/rag/turns', () => {
  const saved = process.env.RAG_INTERNAL_TOKEN;
  let alice: request.Agent;
  let aliceId: bigint;

  beforeAll(async () => {
    process.env.RAG_INTERNAL_TOKEN = TOKEN;
    await resetDb();
    alice = await loginAs('alice');
    aliceId = (await prisma.user.findUniqueOrThrow({ where: { username: 'alice' } })).id;
  });
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE rag_examples, rag_retrievals, rag_turns, rag_sessions RESTART IDENTITY CASCADE');
  });
  afterAll(() => {
    process.env.RAG_INTERNAL_TOKEN = saved;
  });

  it('guest: one session per visitor token, stored only as its sha256, turns numbered in order', async () => {
    const first = await request(app).post('/api/rag/turns').set('X-Internal-Token', TOKEN).send(turn());
    expect(first.status).toBe(201);
    expect(first.body).toEqual({ turnId: expect.any(Number), sessionId: expect.any(Number) });
    const second = await request(app).post('/api/rag/turns').set('X-Internal-Token', TOKEN).send(turn({ userText: 'And shipping?' }));
    expect(second.body.sessionId).toBe(first.body.sessionId);

    const sessions = await prisma.ragSession.findMany({ include: { turns: { orderBy: { turnIndex: 'asc' } } } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].userId).toBeNull();
    expect(sessions[0].visitorHash).toBe(visitorHash(VISITOR));
    expect(sessions[0].visitorHash).not.toContain(VISITOR);
    expect(sessions[0].turns.map((t) => [t.turnIndex, t.userText])).toEqual([[0, 'What is the fee?'], [1, 'And shipping?']]);
    expect(sessions[0].turns[0]).toMatchObject({
      botText: 'The fee is 5%.', outcome: 'answered', guardTriggered: null, model: 'gemini-test',
      promptVersion: 'a'.repeat(64), promptTokens: 120, completionTokens: 30, latencyMs: 850,
    });
  });

  it('signed-in customer: user_id from the forwarded cookie, never from the body; a new session per user', async () => {
    await request(app).post('/api/rag/turns').set('X-Internal-Token', TOKEN).send(turn());
    const res = await alice.post('/api/rag/turns').set('X-Internal-Token', TOKEN).send(turn({ userId: 999 }));
    expect(res.status).toBe(201);
    const session = await prisma.ragSession.findUniqueOrThrow({ where: { id: BigInt(res.body.sessionId) } });
    expect(session.userId).toBe(aliceId);
    expect(await prisma.ragSession.count()).toBe(2); // the guest row with the same token stays separate
  });

  it('refused turn keeps the guard that fired', async () => {
    const res = await request(app).post('/api/rag/turns').set('X-Internal-Token', TOKEN)
      .send(turn({ botText: null, outcome: 'refused', guardTriggered: 'prompt_injection', promptTokens: null }));
    expect(res.status).toBe(201);
    expect(await prisma.ragTurn.findUniqueOrThrow({ where: { id: BigInt(res.body.turnId) } })).toMatchObject({
      outcome: 'refused', guardTriggered: 'prompt_injection', botText: null, promptTokens: null,
    });
  });

  it('needs the service token and a valid body', async () => {
    expect((await alice.post('/api/rag/turns').send(turn())).status).toBe(401);
    expect((await request(app).post('/api/rag/turns').set('X-Internal-Token', 'wrong').send(turn())).status).toBe(401);
    for (const bad of [{ outcome: 'maybe' }, { visitor: 'short' }, { userText: '' }, { model: undefined }, { latencyMs: -1 }]) {
      const res = await request(app).post('/api/rag/turns').set('X-Internal-Token', TOKEN).send(turn(bad));
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    expect(await prisma.ragTurn.count()).toBe(0);
  });
});
