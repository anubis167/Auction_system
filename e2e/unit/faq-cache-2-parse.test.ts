import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeQuestion, parseFaqText } from '../../be/src/lib/faqs';

// faq-cache-2: faq.txt -> FAQ rows, and the one spelling used to match questions.
describe('faq-cache-2 parseFaqText', () => {
  const entries = parseFaqText(readFileSync(path.resolve(__dirname, '../../faq.txt'), 'utf8'));

  it('finds all 38 questions in order, none from the intro or the knowledge-base notes', () => {
    expect(entries).toHaveLength(38);
    expect(entries.map((e) => e.sortOrder)).toEqual(Array.from({ length: 38 }, (_, i) => i + 1));
    expect(entries.some((e) => /Do not invent/.test(e.answer))).toBe(false);
  });

  it('keeps category, question and the whole answer', () => {
    expect(entries[0]).toEqual({
      category: 'General',
      question: 'What is the Online Auction System?',
      sortOrder: 1,
      answer:
        'The Online Auction System is a platform where sellers list goods for auction and eligible users participate by placing bids.\n\n' +
        'The platform manages auction timing, bid validation, winner determination, and the defined credit and payment workflow.',
    });
    expect(entries[4]).toMatchObject({ category: 'Account and security', question: 'How do I create an account?' });
    expect(entries[37]).toMatchObject({ category: 'Disputes, service limitations, and support', question: 'Can I appeal an account restriction?' });
    expect(entries[37].answer).toMatch(/^An appeal process is recommended/);
    expect(entries[37].answer).toMatch(/currently available procedure\.$/);
  });

  it('handles Windows line endings and an empty file', () => {
    expect(parseFaqText('# A. GENERAL\r\n\r\n### Q1. Hi?\r\n\r\nYes.\r\n')).toEqual([
      { category: 'General', question: 'Hi?', answer: 'Yes.', sortOrder: 1 },
    ]);
    expect(parseFaqText('')).toEqual([]);
  });
});

describe('faq-cache-2 normalizeQuestion', () => {
  it('ignores case, spacing and trailing punctuation', () => {
    expect(normalizeQuestion('  How do I   create an ACCOUNT?  ')).toBe('how do i create an account');
    expect(normalizeQuestion('how do i create an account')).toBe('how do i create an account');
    expect(normalizeQuestion('How do I\tcreate an account ?!.')).toBe('how do i create an account');
  });

  it('keeps punctuation inside the question', () => {
    expect(normalizeQuestion('What is the fee for $10,000?')).toBe('what is the fee for $10,000');
  });
});
