import { beforeAll, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { prisma } from '../../be/src/db';
import { resetDb } from '../../be/tests/helpers';
import { seedFaqs } from '../../be/prisma/seed';
import { normalizeQuestion } from '../../be/src/lib/faqs';

// faq-cache-2: the faqs table, seeded from faq.txt by the normal seed.
describe('faq-cache-2 faqs table', () => {
  beforeAll(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE faqs RESTART IDENTITY CASCADE');
    await resetDb(); // runs seed(), which seeds the FAQ
  });

  it('the seed stores the 38 questions with their normalized form', async () => {
    expect(await prisma.faq.count()).toBe(38);
    const q5 = await prisma.faq.findFirstOrThrow({ where: { sortOrder: 5 } });
    expect(q5).toMatchObject({
      category: 'Account and security',
      question: 'How do I create an account?',
      normalizedQuestion: 'how do i create an account',
      createdById: null,
      deletedAt: null,
    });
  });

  it('seeding again adds nothing and does not undo an edit', async () => {
    await prisma.faq.updateMany({ where: { sortOrder: 1 }, data: { answer: 'Edited by staff' } });
    await seedFaqs(prisma);
    expect(await prisma.faq.count()).toBe(38);
    expect((await prisma.faq.findFirstOrThrow({ where: { sortOrder: 1 } })).answer).toBe('Edited by staff');
  });

  it('a second live row with the same normalized question is rejected', async () => {
    const err = await prisma.faq
      .create({ data: { category: 'General', question: 'HOW do I create an account', answer: 'x', normalizedQuestion: normalizeQuestion('HOW do I create an account') } })
      .catch((e) => e);
    expect(err).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect(err.code).toBe('P2002');
  });

  it('a soft-deleted row frees its question, and the seed does not bring it back', async () => {
    await prisma.faq.updateMany({ where: { sortOrder: 2 }, data: { deletedAt: new Date() } });
    await seedFaqs(prisma);
    expect(await prisma.faq.count({ where: { deletedAt: null } })).toBe(37);
    const again = await prisma.faq.create({
      data: { category: 'General', question: 'Can I browse auctions without logging in?', answer: 'New answer', normalizedQuestion: 'can i browse auctions without logging in' },
    });
    expect(again.deletedAt).toBeNull();
    expect(await prisma.faq.count({ where: { normalizedQuestion: 'can i browse auctions without logging in' } })).toBe(2);
  });
});
