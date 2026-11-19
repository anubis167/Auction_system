import { describe, expect, it } from 'vitest';
import { badgesFor, isSoundWord, lotLabel, priceLabel, shortLeft, toneFor, TONES } from '../../fe/src/brand';

// pop-0.2: pure brand rules behind Badge, Burst, LotCard (fe/src/brand.ts).
const now = Date.parse('2026-11-19T12:00:00Z');
const lot = (status: string, minutesLeft: number, id = 7) => ({ id, status, endTime: new Date(now + minutesLeft * 60_000).toISOString() });

describe('pop-0.2 badgesFor', () => {
  it("'Ending soon!' only under one hour; a time chip otherwise", () => {
    expect(badgesFor(lot('active', 59), now)).toEqual([
      { kind: 'live', label: 'Live' },
      { kind: 'ending', label: 'Ending soon!' },
    ]);
    expect(badgesFor(lot('active', 61), now)).toEqual([
      { kind: 'live', label: 'Live' },
      { kind: 'time', label: '1h 1m' },
    ]);
  });

  it("'live' replaces the lot number; upcoming and ended lots keep it", () => {
    expect(badgesFor(lot('active', 30), now).map((b) => b.kind)).not.toContain('lot');
    expect(badgesFor(lot('upcoming', 300), now)).toEqual([{ kind: 'lot', label: 'Lot 007' }]);
    expect(badgesFor(lot('ended', -5), now)).toEqual([
      { kind: 'lot', label: 'Lot 007' },
      { kind: 'gone', label: 'GONE!' },
    ]);
    expect(badgesFor(lot('cancelled', 30), now)).toEqual([{ kind: 'lot', label: 'Lot 007' }]);
    // An active lot past its end time (close job not run yet) is no longer live.
    expect(badgesFor(lot('active', -1), now)).toEqual([{ kind: 'lot', label: 'Lot 007' }]);
  });

  it('never returns more than two badges', () => {
    for (const status of ['active', 'upcoming', 'ended', 'cancelled'])
      for (const m of [-10, 0.5, 30, 59, 61, 5000]) expect(badgesFor(lot(status, m), now).length).toBeLessThanOrEqual(2);
  });

  it('labels', () => {
    expect(lotLabel(7)).toBe('Lot 007');
    expect(lotLabel(1234)).toBe('Lot 1234');
    expect(shortLeft(30_000)).toBe('<1m');
    expect(shortLeft(41 * 60_000)).toBe('41m');
    expect(shortLeft((3 * 1440 + 4 * 60 + 5) * 60_000)).toBe('3d 4h');
  });
});

describe('pop-0.2 sound words and tones', () => {
  it('isSoundWord accepts the bank only', () => {
    for (const w of ['POW!', 'BAM!', 'ZAP!', 'WHOA!', 'KAPOW!', 'Holler!', 'GONE!']) expect(isSoundWord(w)).toBe(true);
    for (const w of ['pow!', 'BOOM!', 'Error!', '', 'POW']) expect(isSoundWord(w)).toBe(false);
  });

  it('toneFor never gives neighbours the same tone', () => {
    for (let i = 0; i < 50; i++) expect(toneFor(i)).not.toBe(toneFor(i + 1));
    expect(new Set(Array.from({ length: 6 }, (_, i) => toneFor(i)))).toEqual(new Set(TONES));
  });
});

describe('pop-0.2 priceLabel', () => {
  it("'No bids yet' instead of $0", () => {
    expect(priceLabel(null, 0)).toBe('No bids yet');
    expect(priceLabel(0, 0)).toBe('No bids yet');
    expect(priceLabel(150, 0)).toBe('No bids yet');
    expect(priceLabel(150, 2)).toBe('$150.00');
  });
});
