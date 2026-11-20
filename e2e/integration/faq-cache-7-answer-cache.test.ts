import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../be/src/db';
import { cache } from '../../be/src/lib/cache';
import { app, loginAs, resetDb } from '../../be/tests/helpers';

const TOKEN = 'faq-cache-7-token';
const lookup = (q: string, token = TOKEN) => request(app).get('/api/rag/answer-cache').query({ q }).set('X-Internal-Token', token);
const store = (body: Record<string, unknown>, token = TOKEN) => request(app).put('/api/rag/answer-cache').set('X-Internal-Token', token).send(body);

// faq-cache-7: cached Gemini answers for guests, dropped whenever a document or an FAQ changes.
describe('faq-cache-7 /api/rag/answer-cache', () => {
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
  beforeEach(() => cache.delByPrefix('rag:'));

  /** Store an answer for q under the current version; returns that version. */
  async function cacheAnswer(q: string, reply = 'Cached reply') {
    const { version } = (await lookup(q)).body;
    expect((await store({ question: q, version, reply, sources: ['Fees'] })).status).toBe(204);
    return version as string;
  }

  it('miss gives the version; PUT then GET returns the answer, also for the same question spelled differently', async () => {
    const miss = await lookup('What fee do you charge?');
    expect(miss.status).toBe(200);
    expect(miss.body).toEqual({ version: '0', answer: null });
    await cacheAnswer('What fee do you charge?');
    expect((await lookup('  what FEE do you charge ')).body).toEqual({ version: '0', answer: { reply: 'Cached reply', sources: ['Fees'] } });
    expect((await lookup('Something else?')).body.answer).toBeNull();
  });

  it('uploading or deleting a document drops every cached answer', async () => {
    const before = await cacheAnswer('What fee do you charge?');
    const up = await staff
      .post('/api/rag/documents')
      .set('X-Internal-Token', TOKEN)
      .send({ title: 'Fees', filename: 'fees.md', mimeType: 'text/markdown', content: 'Fee is 5%.', chunks: [{ text: 'Fee is 5%.', embedding: [1, 0] }] });
    expect(up.status).toBe(201);
    const afterUpload = await lookup('What fee do you charge?');
    expect(afterUpload.body.answer).toBeNull();
    expect(afterUpload.body.version).not.toBe(before);

    await cacheAnswer('What fee do you charge?');
    expect((await staff.delete(`/api/rag/documents/${up.body.id}`)).status).toBe(204);
    expect((await lookup('What fee do you charge?')).body.answer).toBeNull();
  });

  it('an FAQ edit drops every cached answer', async () => {
    await cacheAnswer('What fee do you charge?');
    const faq = await prisma.faq.findFirstOrThrow({ where: { sortOrder: 1 } });
    await staff.put(`/api/faqs/${faq.id}`).send({ category: faq.category, question: faq.question, answer: 'Edited' });
    expect((await lookup('What fee do you charge?')).body.answer).toBeNull();
  });

  it('an answer written with an old version is refused (409) and not cached', async () => {
    const { version } = (await lookup('What fee do you charge?')).body;
    const faq = await prisma.faq.findFirstOrThrow({ where: { sortOrder: 2 } });
    await staff.put(`/api/faqs/${faq.id}`).send({ category: faq.category, question: faq.question, answer: 'Changed meanwhile' });
    expect((await store({ question: 'What fee do you charge?', version, reply: 'Stale' })).status).toBe(409);
    expect((await lookup('What fee do you charge?')).body.answer).toBeNull();
  });

  it('bad bodies are 400; a missing or wrong token is 401', async () => {
    const { version } = (await lookup('q')).body;
    for (const bad of [{}, { question: '', version, reply: 'r' }, { question: 'q', version, reply: '' }, { question: 'q', version: '', reply: 'r' }, { question: 'q', version, reply: 'r', sources: 'Fees' }]) {
      expect((await store(bad)).status).toBe(400);
    }
    expect((await lookup('')).status).toBe(400);
    expect((await lookup('q', 'wrong')).status).toBe(401);
    expect((await store({ question: 'q', version, reply: 'r' }, 'wrong')).status).toBe(401);
    expect((await request(app).get('/api/rag/answer-cache').query({ q: 'q' })).status).toBe(401);
  });
});
