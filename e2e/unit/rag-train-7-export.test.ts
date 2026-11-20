import { describe, expect, it } from 'vitest';
import { toJsonl, toTrainingRecord } from '../../be/src/lib/ragExport';

// rag-train-7: the export keeps only training fields, never who the visitor or reviewer was.
describe('rag-train-7 toTrainingRecord', () => {
  const example = {
    id: 7n,
    status: 'approved',
    label: 'needs_fix',
    idealReply: 'Better.',
    reviewerId: 3n,
    reviewer: { username: 'admin', email: 'admin@example.com' },
    turn: {
      userText: 'Fee?',
      botText: 'Five [Fees]',
      session: { userId: 9n, visitorHash: 'f'.repeat(64), user: { username: 'alice', email: 'alice@example.com', fullName: 'Alice A' } },
      retrievals: [
        { rank: 2, chunk: { text: 'second', id: 22n } },
        { rank: 1, chunk: { text: 'first', id: 11n } },
      ],
    },
  };

  it('keeps question, chunk texts by rank, reply, ideal reply and label, and nothing else', () => {
    const record = toTrainingRecord(example);
    expect(record).toEqual({ question: 'Fee?', chunks: ['first', 'second'], reply: 'Five [Fees]', idealReply: 'Better.', label: 'needs_fix' });
    const line = toJsonl([record]);
    for (const leak of ['userId', 'visitorHash', 'fffff', 'email', 'alice', 'Alice', 'admin', 'reviewer', '"id"']) expect(line).not.toContain(leak);
  });

  it('writes one JSON object per line', () => {
    const lines = toJsonl([toTrainingRecord(example), toTrainingRecord({ ...example, idealReply: null })]).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe('');
    expect(JSON.parse(lines[1]).idealReply).toBeNull();
    expect(toJsonl([])).toBe('');
  });
});
