import { Prisma, type Faq } from '@prisma/client';
import { Router, type Response } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { prisma } from '../db';
import { cache } from '../lib/cache';
import { normalizeQuestion } from '../lib/faqs';
import { HttpError, asyncHandler } from '../lib/http';
import { requirePermission } from '../middleware/auth';
import { parseId } from './auctions';

// faq-cache-3: the FAQ, cache-aside from Redis (docs/faq-cache.md). Public: guests read it too.
export const faqsRouter = Router();

export const FAQ_LIST_KEY = 'faq:list';
export const faqItemKey = (id: bigint | number) => `faq:item:${id}`;
/** faq-cache-5: the chat bot's question -> answer keys; any FAQ write can change a match, so all go. */
export const FAQ_MATCH_PREFIX = 'faq:q:';

/** faq-cache-4: after every FAQ write, so readers and the chat bot see it on their next request. */
export async function clearFaqCache(id: bigint) {
  await cache.del(FAQ_LIST_KEY, faqItemKey(id));
  await cache.delByPrefix(FAQ_MATCH_PREFIX);
}

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

// faq-cache-4: staff and admins (knowledge.manage, the same people who manage the bot's documents) edit the FAQ.
const faqBody = z.object({
  category: z.string().trim().min(1, 'Category is required').max(100),
  question: z.string().trim().min(1, 'Question is required').max(500),
  answer: z.string().trim().min(1, 'Answer is required').max(10_000),
  sortOrder: z.number().int().min(0).max(1_000_000).optional(),
});

/** A live FAQ with the same normalized question already exists (partial unique index, faq-cache-2). */
function duplicate(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    throw new HttpError(409, 'An FAQ with this question already exists');
  }
  throw err;
}

faqsRouter.post(
  '/',
  requirePermission('knowledge.manage'),
  asyncHandler(async (req, res) => {
    const body = faqBody.parse(req.body);
    // New questions go last unless a place is given
    const sortOrder = body.sortOrder ?? ((await prisma.faq.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0) + 1;
    const faq = await prisma.faq
      .create({
        data: { ...body, sortOrder, normalizedQuestion: normalizeQuestion(body.question), createdById: req.user!.id, updatedById: req.user!.id },
      })
      .catch(duplicate);
    await clearFaqCache(faq.id);
    res.status(201).json(faqView(faq));
  }),
);

faqsRouter.put(
  '/:id',
  requirePermission('knowledge.manage'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const body = faqBody.parse(req.body);
    const live = await prisma.faq.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!live) throw new HttpError(404, 'FAQ not found');
    const faq = await prisma.faq
      .update({ where: { id }, data: { ...body, normalizedQuestion: normalizeQuestion(body.question), updatedById: req.user!.id } })
      .catch(duplicate);
    await clearFaqCache(id);
    res.json(faqView(faq));
  }),
);

faqsRouter.delete(
  '/:id',
  requirePermission('knowledge.manage'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    // Soft delete (SRS: all delete means soft delete)
    const { count } = await prisma.faq.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), updatedById: req.user!.id },
    });
    if (count === 0) throw new HttpError(404, 'FAQ not found');
    await clearFaqCache(id);
    res.status(204).end();
  }),
);
