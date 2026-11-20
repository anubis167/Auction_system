import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../be/src/db';
import { visitorHash } from '../../be/src/routes/rag';
import { app, resetDb } from '../../be/tests/helpers';

// rag-train-5: logging_consent on rag_sessions; an opted-out visitor gets a session row and no turns.
const TOKEN = 'test-internal-token-train5';
const VISITOR = 'c'.repeat(40);
const send = (body: Record<string, unknown>) => request(app).post('/api/rag/turns').set('X-Internal-Token', TOKEN).send(body);
const turn = { visitor: VISITOR, userText: 'Fee?', botText: '5%', outcome: 'answered', model: 'm', promptVersion: 'p' };

describe('rag-train-5 logging consent', () => {
  const saved = process.env.RAG_INTERNAL_TOKEN;
  beforeAll(async () => {
    process.env.RAG_INTERNAL_TOKEN = TOKEN;
    await resetDb();
  });
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE rag_examples, rag_retrievals, rag_turns, rag_sessions RESTART IDENTITY CASCADE');
  });
  afterAll(() => {
    process.env.RAG_INTERNAL_TOKEN = saved;
  });

  it('new sessions default to consent true', async () => {
    expect((await send(turn)).status).toBe(201);
    expect((await prisma.ragSession.findFirstOrThrow()).loggingConsent).toBe(true);
  });

  it('opted out: a session with logging_consent false and no turn row; any text sent is ignored', async () => {
    const res = await send({ visitor: VISITOR, logging: false, userText: 'secret question' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ turnId: null, sessionId: expect.any(Number) });
    const session = await prisma.ragSession.findFirstOrThrow({ where: { visitorHash: visitorHash(VISITOR) } });
    expect(session.loggingConsent).toBe(false);
    expect(await prisma.ragTurn.count()).toBe(0);
    expect((await send({ visitor: 'short', logging: false })).status).toBe(400);
  });

  it('opting out mid-conversation flips the session and stops new turns; opting back in resumes', async () => {
    await send(turn);
    await send({ visitor: VISITOR, logging: false });
    expect(await prisma.ragTurn.count()).toBe(1);
    expect((await prisma.ragSession.findFirstOrThrow()).loggingConsent).toBe(false);
    expect((await send(turn)).status).toBe(201);
    expect((await prisma.ragSession.findFirstOrThrow()).loggingConsent).toBe(true);
    expect(await prisma.ragSession.count()).toBe(1);
    expect(await prisma.ragTurn.count()).toBe(2);
  });
});
