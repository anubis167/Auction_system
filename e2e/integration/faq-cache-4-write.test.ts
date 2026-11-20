import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../be/src/db';
import { cache } from '../../be/src/lib/cache';
import { app, loginAs, resetDb } from '../../be/tests/helpers';

type Group = { faqs: { id: number; question: string; answer: string }[] };
const allFaqs = (body: { categories: Group[] }) => body.categories.flatMap((c) => c.faqs);

// faq-cache-4: staff and admins edit the FAQ; each write clears the cached copies.
describe('faq-cache-4 FAQ writes', () => {
  let staff: request.Agent;
  let admin: request.Agent;
  let customer: request.Agent;

  beforeAll(async () => {
    await resetDb();
    for (let i = 0; i < 50 && !cache.ready; i++) await new Promise((r) => setTimeout(r, 100));
    [staff, admin, customer] = await Promise.all([loginAs('staff'), loginAs('admin'), loginAs('alice')]);
  });
  beforeEach(() => cache.delByPrefix('faq:'));

  it('create -> listed at once (MISS then HIT), last in order, created by staff', async () => {
    await request(app).get('/api/faqs'); // warm the cache
    const created = await staff.post('/api/faqs').send({ category: 'General', question: 'Is there a mobile app?', answer: 'Not yet.' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ category: 'General', question: 'Is there a mobile app?', answer: 'Not yet.', sortOrder: 39 });

    const list = await request(app).get('/api/faqs');
    expect(list.headers['x-cache']).toBe('MISS');
    expect(allFaqs(list.body).map((f) => f.question)).toContain('Is there a mobile app?');
    expect((await request(app).get('/api/faqs')).headers['x-cache']).toBe('HIT');

    const row = await prisma.faq.findUniqueOrThrow({ where: { id: BigInt(created.body.id) }, include: { createdBy: true } });
    expect(row.createdBy?.username).toBe('staff');
    expect(row.normalizedQuestion).toBe('is there a mobile app');
  });

  it('edit -> the list and the item show the new text on the next request', async () => {
    const faq = await prisma.faq.findFirstOrThrow({ where: { sortOrder: 4 } });
    await request(app).get('/api/faqs');
    await request(app).get(`/api/faqs/${faq.id}`);
    const edited = await admin
      .put(`/api/faqs/${faq.id}`)
      .send({ category: faq.category, question: faq.question, answer: 'Prices are in USD.' });
    expect(edited.status).toBe(200);
    expect(edited.body.answer).toBe('Prices are in USD.');

    const item = await request(app).get(`/api/faqs/${faq.id}`);
    expect(item.headers['x-cache']).toBe('MISS');
    expect(item.body.answer).toBe('Prices are in USD.');
    expect(allFaqs((await request(app).get('/api/faqs')).body).find((f) => f.id === Number(faq.id))?.answer).toBe('Prices are in USD.');
  });

  it('delete is a soft delete: row kept with deleted_at, gone from the API, cannot be edited or deleted again', async () => {
    const faq = await prisma.faq.findFirstOrThrow({ where: { sortOrder: 6 } });
    await request(app).get('/api/faqs');
    await request(app).get(`/api/faqs/${faq.id}`);
    expect((await staff.delete(`/api/faqs/${faq.id}`)).status).toBe(204);

    const row = await prisma.faq.findUniqueOrThrow({ where: { id: faq.id }, include: { updatedBy: true } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.updatedBy?.username).toBe('staff');
    expect((await request(app).get(`/api/faqs/${faq.id}`)).status).toBe(404);
    expect(allFaqs((await request(app).get('/api/faqs')).body).map((f) => f.id)).not.toContain(Number(faq.id));
    expect((await staff.put(`/api/faqs/${faq.id}`).send({ category: 'x', question: 'y', answer: 'z' })).status).toBe(404);
    expect((await staff.delete(`/api/faqs/${faq.id}`)).status).toBe(404);
  });

  it('a write clears the chat bot match keys (faq:q:*) but not unrelated keys', async () => {
    await cache.set('faq:q:abc', { answer: 'old' }, 60);
    await cache.set('rag:other', 1, 60);
    const faq = await prisma.faq.findFirstOrThrow({ where: { sortOrder: 7, deletedAt: null } });
    await staff.put(`/api/faqs/${faq.id}`).send({ category: faq.category, question: faq.question, answer: 'Changed' });
    expect(await cache.get('faq:q:abc')).toBeNull();
    expect(await cache.get('rag:other')).toBe(1);
    await cache.del('rag:other');
  });

  it('customers get 403, guests 401; nothing changes', async () => {
    const faq = await prisma.faq.findFirstOrThrow({ where: { sortOrder: 8 } });
    const body = { category: 'General', question: 'Hacked?', answer: 'Yes' };
    expect((await customer.post('/api/faqs').send(body)).status).toBe(403);
    expect((await customer.put(`/api/faqs/${faq.id}`).send(body)).status).toBe(403);
    expect((await customer.delete(`/api/faqs/${faq.id}`)).status).toBe(403);
    expect((await request(app).post('/api/faqs').send(body)).status).toBe(401);
    expect((await request(app).delete(`/api/faqs/${faq.id}`)).status).toBe(401);
    expect(await prisma.faq.findUniqueOrThrow({ where: { id: faq.id } })).toEqual(faq);
    expect(await prisma.faq.count({ where: { question: 'Hacked?' } })).toBe(0);
  });

  it('a question that matches a live FAQ after normalizing is 409; invalid bodies are 400', async () => {
    const dup = await staff.post('/api/faqs').send({ category: 'General', question: '  how do I CREATE an account ', answer: 'x' });
    expect(dup.status).toBe(409);
    const other = await prisma.faq.findFirstOrThrow({ where: { sortOrder: 9 } });
    expect((await staff.put(`/api/faqs/${other.id}`).send({ category: 'x', question: 'How do I add credit?', answer: 'x' })).status).toBe(409);

    for (const bad of [{}, { category: '', question: 'q', answer: 'a' }, { category: 'c', question: ' ', answer: 'a' }, { category: 'c', question: 'q', answer: '' }, { category: 'c', question: 'x'.repeat(501), answer: 'a' }, { category: 'c', question: 'q', answer: 'a', sortOrder: -1 }]) {
      expect((await staff.post('/api/faqs').send(bad)).status).toBe(400);
    }
  });
});
