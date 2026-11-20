import { afterEach, describe, expect, it } from 'vitest';
import { config } from '../../be/src/config';
import { auctionJobs } from '../../be/src/lib/scheduler';
import { retentionCutoff } from '../../be/src/lib/ragRetention';

// rag-train-8: the cutoff date and its setting.
describe('rag-train-8 retention cutoff', () => {
  const saved = process.env.RAG_TURN_RETENTION_DAYS;
  afterEach(() => {
    if (saved === undefined) delete process.env.RAG_TURN_RETENTION_DAYS;
    else process.env.RAG_TURN_RETENTION_DAYS = saved;
  });

  it('is exactly the given number of days before now', () => {
    const now = new Date('2026-11-20T12:00:00.000Z');
    expect(retentionCutoff(now, 180).toISOString()).toBe('2026-05-24T12:00:00.000Z');
    expect(retentionCutoff(now, 1).toISOString()).toBe('2026-11-19T12:00:00.000Z');
  });

  it('RAG_TURN_RETENTION_DAYS defaults to 180 and ignores bad values', () => {
    delete process.env.RAG_TURN_RETENTION_DAYS;
    expect(config.ragTurnRetentionDays).toBe(180);
    process.env.RAG_TURN_RETENTION_DAYS = '30';
    expect(config.ragTurnRetentionDays).toBe(30);
    for (const bad of ['0', '-5', 'abc', '']) {
      process.env.RAG_TURN_RETENTION_DAYS = bad;
      expect(config.ragTurnRetentionDays).toBe(180);
    }
  });

  it('runs with the auction jobs, on the same interval setting', () => {
    expect(auctionJobs(5000).map((j) => [j.name, j.intervalMs])).toContainEqual(['rag-retention', 5000]);
  });
});
