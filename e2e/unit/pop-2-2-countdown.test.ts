import { describe, expect, it } from 'vitest';
import { marksCrossed, splitCountdown } from '../../fe/src/brand';

// pop-2.2: pure helpers behind the comic Countdown panel (fe/src/brand.ts).
describe('pop-2.2 splitCountdown', () => {
  it('splits into two-digit hours (not capped at 24), minutes and seconds', () => {
    expect(splitCountdown(0)).toEqual({ hours: '00', minutes: '00', seconds: '00' });
    expect(splitCountdown(-5000)).toEqual({ hours: '00', minutes: '00', seconds: '00' });
    expect(splitCountdown(59_000)).toEqual({ hours: '00', minutes: '00', seconds: '59' });
    expect(splitCountdown(59_999)).toEqual({ hours: '00', minutes: '00', seconds: '59' });
    expect(splitCountdown((3600 + 60 + 1) * 1000)).toEqual({ hours: '01', minutes: '01', seconds: '01' });
    expect(splitCountdown((30 * 3600 + 5 * 60) * 1000)).toEqual({ hours: '30', minutes: '05', seconds: '00' });
  });
});

describe('pop-2.2 marksCrossed', () => {
  it('fires the 5-minute and 1-minute marks exactly once while ticking down', () => {
    const heard: string[] = [];
    let prev = Number.POSITIVE_INFINITY;
    for (let ms = 6 * 60_000; ms >= 0; ms -= 1000) {
      heard.push(...marksCrossed(prev, ms));
      prev = ms;
    }
    expect(heard).toEqual(['5 minutes left', '1 minute left']);
  });

  it('a page opened inside a mark hears it; jumps over both marks report both', () => {
    expect(marksCrossed(Number.POSITIVE_INFINITY, 4 * 60_000)).toEqual(['5 minutes left']);
    expect(marksCrossed(Number.POSITIVE_INFINITY, 30_000)).toEqual(['5 minutes left', '1 minute left']);
    expect(marksCrossed(Number.POSITIVE_INFINITY, 10 * 60_000)).toEqual([]);
    expect(marksCrossed(4 * 60_000, 3 * 60_000)).toEqual([]);
  });
});
