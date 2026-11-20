import { config } from '../config';
import { prisma } from '../db';

const DAY_MS = 24 * 60 * 60 * 1000;

/** rag-train-8: turns created before this moment are past the retention period. */
export const retentionCutoff = (now: Date, days: number) => new Date(now.getTime() - days * DAY_MS);

/**
 * Soft-deletes turns older than the retention period that were never reviewed (no rag_examples row).
 * Reviewed turns are training data and stay. Returns how many turns were deleted.
 */
export async function softDeleteOldTurns(now = new Date(), days = config.ragTurnRetentionDays) {
  const { count } = await prisma.ragTurn.updateMany({
    where: { createdAt: { lt: retentionCutoff(now, days) }, deletedAt: null, example: { is: null } },
    data: { deletedAt: now },
  });
  return count;
}
