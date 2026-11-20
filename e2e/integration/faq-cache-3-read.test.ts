import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../be/src/db';
import { cache, createCache } from '../../be/src/lib/cache';
import { app, resetDb } from '../../be/tests/helpers';

async function untilReady() {
  for (let i = 0; i < 50 && !cache.ready; i++) await new Promise((r) => setTimeout(r, 100));
  if (!cache.ready) throw new Error('Redis not reachable: run npm run db:up');
}

// faq-cache-3: public FAQ reads, served from Redis after the first request.
describe('faq-cache-3 GET /api/faqs', () => {
  beforeAll(async () => {
    await resetDb();
    await untilReady();
  });
  beforeEach(() => cache.delByPrefix('faq:'));

  it('lists live FAQs grouped by category in faq.txt order: MISS, then HIT with the same body', async () => {
    const first = await request(app).get('/api/faqs');
    expect(first.status).toBe(200);
    expect(first.headers['x-cache']).toBe('MISS');
    const categories = first.body.categories as { category: string; faqs: { id: number; question: string; sortOrder: number }[] }[];
    expect(categories.map((c) => c.category)).toEqual([
      'General',
      'Account and security',
      'Credit account and payments',
      'Selling and listing goods',
      'Bidding',
      'Auction closing and winner determination',
      'Platform commission',
      'Disputes, service limitations, and support',
    ]);
    expect(categories.flatMap((c) => c.faqs)).toHaveLength(38);
    expect(categories[1].faqs[0]).toMatchObject({ question: 'How do I create an account?', sortOrder: 5 });
    expect(categories[1].faqs[0]).not.toHaveProperty('normalizedQuestion');

    const second = await request(app).get('/api/faqs');
    expect(second.headers['x-cache']).toBe('HIT');
    expect(second.body).toEqual(first.body);
  });

  it('GET /:id returns one FAQ, MISS then HIT; unknown, bad and deleted ids are 404', async () => {
    const faq = await prisma.faq.findFirstOrThrow({ where: { sortOrder: 11 } });
    const first = await request(app).get(`/api/faqs/${faq.id}`);
    expect(first.status).toBe(200);
    expect(first.headers['x-cache']).toBe('MISS');
    expect(first.body).toMatchObject({ id: Number(faq.id), question: faq.question, answer: faq.answer, category: faq.category });
    const second = await request(app).get(`/api/faqs/${faq.id}`);
    expect(second.headers['x-cache']).toBe('HIT');
    expect(second.body).toEqual(first.body);

    expect((await request(app).get('/api/faqs/999999')).status).toBe(404);
    expect((await request(app).get('/api/faqs/abc')).status).toBe(404);

    const gone = await prisma.faq.findFirstOrThrow({ where: { sortOrder: 3 } });
    await prisma.faq.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });
    await cache.delByPrefix('faq:');
    expect((await request(app).get(`/api/faqs/${gone.id}`)).status).toBe(404);
    const list = await request(app).get('/api/faqs');
    const ids = list.body.categories.flatMap((c: { faqs: { id: number }[] }) => c.faqs.map((f) => f.id));
    expect(ids).toHaveLength(37);
    expect(ids).not.toContain(Number(gone.id));
  });
});

describe('faq-cache-3 GET /api/faqs with Redis down', () => {
  const down = createCache('redis://127.0.0.1:1/0');
  beforeAll(async () => {
    await resetDb();
    vi.spyOn(cache, 'get').mockImplementation((key) => down.get(key));
    vi.spyOn(cache, 'set').mockImplementation((key, value, ttl) => down.set(key, value, ttl));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await down.close();
  });

  it('still answers from Postgres, every time a MISS', async () => {
    for (let i = 0; i < 2; i++) {
      const res = await request(app).get('/api/faqs');
      expect(res.status).toBe(200);
      expect(res.headers['x-cache']).toBe('MISS');
      expect(res.body.categories.flatMap((c: { faqs: unknown[] }) => c.faqs)).toHaveLength(38);
    }
    const faq = await prisma.faq.findFirstOrThrow({ where: { sortOrder: 1 } });
    const one = await request(app).get(`/api/faqs/${faq.id}`);
    expect(one.status).toBe(200);
    expect(one.headers['x-cache']).toBe('MISS');
  });
});
