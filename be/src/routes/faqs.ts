import type { Faq } from '@prisma/client';
import { Router, type Response } from 'express';
import { config } from '../config';
import { prisma } from '../db';
import { cache } from '../lib/cache';
import { HttpError, asyncHandler } from '../lib/http';
import { parseId } from './auctions';

// faq-cache-3: the FAQ, cache-aside from Redis (docs/faq-cache.md). Public: guests read it too.
export const faqsRouter = Router();

export const FAQ_LIST_KEY = 'faq:list';
export const faqItemKey = (id: bigint | number) => `faq:item:${id}`;

/** What the API returns for one FAQ; plain JSON so it can go into Redis as is. */
export function faqView(f: Faq) {
  return { id: Number(f.id), category: f.category, question: f.question, answer: f.answer, sortOrder: f.sortOrder, updatedAt: f.updatedAt.toISOString() };
}
type FaqView = ReturnType<typeof faqView>;

/** Redis first (X-Cache: HIT); else load from Postgres, cache it and say MISS. A null load is not cached. */
async function cached<T>(res: Response, key: string, load: () => Promise<T | null>): Promise<T | null> {
  const hit = await cache.get<T>(key);
  res.set('X-Cache', hit === null ? 'MISS' : 'HIT');
  if (hit !== null) return hit;
  const value = await load();
  // shortcut: a write landing between this load and set can leave stale data cached for up to the TTL; fine for FAQ text
  if (value !== null) await cache.set(key, value, config.faqCacheTtlSeconds);
  return value;
}

/** Live FAQs grouped by category; categories in the order of their first question (faq.txt A..H order). */
faqsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const body = await cached(res, FAQ_LIST_KEY, async () => {
      const rows = await prisma.faq.findMany({ where: { deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
      const groups = new Map<string, FaqView[]>();
      for (const row of rows) {
        if (!groups.has(row.category)) groups.set(row.category, []);
        groups.get(row.category)!.push(faqView(row));
      }
      return { categories: [...groups].map(([category, faqs]) => ({ category, faqs })) };
    });
    res.json(body);
  }),
);

faqsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const faq = await cached(res, faqItemKey(id), async () => {
      const row = await prisma.faq.findFirst({ where: { id, deletedAt: null } });
      return row && faqView(row);
    });
    if (!faq) throw new HttpError(404, 'FAQ not found');
    res.json(faq);
  }),
);
