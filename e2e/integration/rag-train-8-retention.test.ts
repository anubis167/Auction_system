import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../be/src/db';
import { softDeleteOldTurns } from '../../be/src/lib/ragRetention';
import { app, loginAs, resetDb } from '../../be/tests/helpers';

// rag-train-8: one run of the retention job against the test database.
const TOKEN = 'test-internal-token-train8';
const DAY = 24 * 60 * 60 * 1000;

describe('rag-train-8 retention job', () => {
  const saved = process.env.RAG_INTERNAL_TOKEN;
  let admin: request.Agent;
  const ids: Record<string, number> = {};

  beforeAll(async () => {
    process.env.RAG_INTERNAL_TOKEN = TOKEN;
    await resetDb();
    await prisma.$executeRawUnsafe('TRUNCATE rag_examples, rag_retrievals, rag_turns, rag_sessions RESTART IDENTITY CASCADE');
    admin = await loginAs('admin');
    for (const name of ['oldRaw', 'oldReviewed', 'oldRawExample', 'recent']) {
      const res = await request(app).post('/api/rag/turns').set('X-Internal-Token', TOKEN).send({
        visitor: 'k'.repeat(40), userText: name, botText: 'A', outcome: 'answered', model: 'm', promptVersion: 'p',
      });
      ids[name] = res.body.turnId;
    }
    const old = new Date(Date.now() - 200 * DAY);
    await prisma.ragTurn.updateMany({ where: { id: { in: [ids.oldRaw, ids.oldReviewed, ids.oldRawExample].map(BigInt) } }, data: { createdAt: old } });
    await prisma.ragTurn.update({ where: { id: BigInt(ids.recent) }, data: { createdAt: new Date(Date.now() - 179 * DAY) } });
    await admin.post(`/api/rag/review/${ids.oldReviewed}`).send({ decision: 'approve', label: 'good' });
    await prisma.ragExample.create({ data: { turnId: BigInt(ids.oldRawExample) } });
  });
  afterAll(() => {
    process.env.RAG_INTERNAL_TOKEN = saved;
  });

  it('soft-deletes only old turns without a rag_examples row; a second run changes nothing', async () => {
    const now = new Date();
    expect(await softDeleteOldTurns(now, 180)).toBe(1);
    const turns = await prisma.ragTurn.findMany({ orderBy: { id: 'asc' } });
    expect(turns.map((t) => [t.userText, t.deletedAt?.getTime() ?? null])).toEqual([
      ['oldRaw', now.getTime()],
      ['oldReviewed', null],
      ['oldRawExample', null],
      ['recent', null],
    ]);
    expect(await prisma.ragTurn.count()).toBe(4); // soft delete: the row is still there
    expect(await softDeleteOldTurns(new Date(), 180)).toBe(0);
  });

  it('deleted turns leave the review queue and the export', async () => {
    const all = (await admin.get('/api/rag/review?all=1')).body.turns.map((t: { question: string }) => t.question);
    expect(all).not.toContain('oldRaw');
    expect(all).toEqual(expect.arrayContaining(['oldReviewed', 'oldRawExample', 'recent']));

    // An approved example whose turn was deleted is not exported
    await prisma.ragExample.update({ where: { turnId: BigInt(ids.oldRawExample) }, data: { status: 'approved', label: 'good' } });
    await prisma.ragTurn.update({ where: { id: BigInt(ids.oldRawExample) }, data: { deletedAt: new Date() } });
    const file = (await admin.get('/api/rag/examples/export')).text;
    expect(file).toContain('"question":"oldReviewed"');
    expect(file).not.toContain('oldRawExample');
    expect(file).not.toContain('"question":"oldRaw"');
  });
});
