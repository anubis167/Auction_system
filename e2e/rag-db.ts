import { createHash, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

// rag-train-*: specs read the saved training rows straight from the e2e database (playwright.config.ts E2E_DB).
export const e2eDb = new PrismaClient({ datasources: { db: { url: 'postgresql://auction:auction@localhost:5436/auction_e2e' } } });

export const newVisitor = () => randomBytes(32).toString('hex');
export const hashOf = (visitor: string) => createHash('sha256').update(visitor).digest('hex');

/** The turns saved for one chat-box visitor token, oldest first. */
export const turnsOf = (visitor: string) =>
  e2eDb.ragTurn.findMany({
    where: { session: { visitorHash: hashOf(visitor) } },
    include: { session: true },
    orderBy: { id: 'asc' },
  });
