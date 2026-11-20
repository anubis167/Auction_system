import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../be/src/db';
import { cache } from '../../be/src/lib/cache';
import { app, loginAs, resetDb } from '../../be/tests/helpers';

const TOKEN = 'faq-cache-5-token';
const match = (q: string, token: string | null = TOKEN) => {
  const req = request(app).get('/api/rag/faq-match').query({ q });
  return token === null ? req : req.set('X-Internal-Token', token);
};

// faq-cache-5: the chat bot asks Node whether a question is an FAQ; answers come from Redis after the first time.
describe('faq-cache-5 GET /api/rag/faq-match', () => {
  const saved = process.env.RAG_INTERNAL_TOKEN;
  let staff: request.Agent;

  beforeAll(async () => {
    process.env.RAG_INTERNAL_TOKEN = TOKEN;
    await resetDb();
    for (let i = 0; i < 50 && !cache.ready; i++) await new Promise((r) => setTimeout(r, 100));
    staff = await loginAs('staff');
  });
  afterAll(() => {
    process.env.RAG_INTERNAL_TOKEN = saved;
  });
  beforeEach(() => cache.delByPrefix('faq:'));

  it('matches the exact question and the same question with other case, spacing and no "?"; second time from Redis', async () => {
    const faq = await prisma.faq.findFirstOrThrow({ where: { question: 'How do I add credit?' } });
    const exact = await match('How do I add credit?');
    expect(exact.status).toBe(200);
    expect(exact.headers['x-cache']).toBe('MISS');
    expect(exact.body).toEqual({ faqId: Number(faq.id), question: faq.question, answer: faq.answer });

    const loose = await match('  how DO i   add credit ');
    expect(loose.status).toBe(200);
    expect(loose.headers['x-cache']).toBe('HIT');
    expect(loose.body).toEqual(exact.body);
  });

  it('no match is 404, and the miss itself is remembered', async () => {
    const first = await match('What is the weather today?');
    expect(first.status).toBe(404);
    expect(first.headers['x-cache']).toBe('MISS');
    const second = await match('what is the weather today');
    expect(second.status).toBe(404);
    expect(second.headers['x-cache']).toBe('HIT');
  });

  it('a new FAQ matches at once even after its question was a remembered miss', async () => {
    expect((await match('Do you ship abroad?')).status).toBe(404);
    const created = await staff.post('/api/faqs').send({ category: 'General', question: 'Do you ship abroad?', answer: 'No shipping at all.' });
    expect(created.status).toBe(201);
    const res = await match('do you ship abroad');
    expect(res.status).toBe(200);
    expect(res.body.answer).toBe('No shipping at all.');
  });

  it('an edited answer is returned right after the edit; a deleted FAQ no longer matches', async () => {
    const faq = await prisma.faq.findFirstOrThrow({ where: { question: 'Who can place a bid?' } });
    expect((await match('Who can place a bid?')).body.answer).toBe(faq.answer);
    await staff.put(`/api/faqs/${faq.id}`).send({ category: faq.category, question: faq.question, answer: 'Any active customer.' });
    expect((await match('Who can place a bid?')).body.answer).toBe('Any active customer.');
    await staff.delete(`/api/faqs/${faq.id}`);
    expect((await match('Who can place a bid?')).status).toBe(404);
  });

  it('empty, blank or over-long questions are 400; a missing or wrong token is 401', async () => {
    expect((await match('')).status).toBe(400);
    expect((await match(' ?? ')).status).toBe(400);
    expect((await match('x'.repeat(4001))).status).toBe(400);
    expect((await request(app).get('/api/rag/faq-match').set('X-Internal-Token', TOKEN)).status).toBe(400);
    expect((await match('How do I add credit?', null)).status).toBe(401);
    expect((await match('How do I add credit?', 'wrong')).status).toBe(401);
  });
});
