/**
 * pop-0.2: pure 'Beat it! Look' rules (LOT-POP-Brand-Guidelines.md sections 2 and 13), kept out of the
 * components so e2e/unit/pop-0-2-brand-rules.test.ts can pin them down.
 */
import { money } from './api';

/** The sound-word bank. Never on errors, outbids, payments, password or legal copy. */
export const SOUND_WORDS = ['POW!', 'BAM!', 'ZAP!', 'WHOA!', 'KAPOW!', 'Holler!', 'GONE!'] as const;
export type SoundWord = (typeof SOUND_WORDS)[number];
export const isSoundWord = (word: string): word is SoundWord => (SOUND_WORDS as readonly string[]).includes(word);

/** Lot art / burst tones, cycled so neighbouring cards never share a colour. */
export const TONES = ['yellow', 'pink', 'cyan'] as const;
export type Tone = (typeof TONES)[number];
export const toneFor = (index: number): Tone => TONES[((index % TONES.length) + TONES.length) % TONES.length];

/** The 'ending' badge only shows with less than this left (guideline: under one hour). */
export const ENDING_MS = 60 * 60 * 1000;

export type BadgeKind = 'live' | 'ending' | 'lot' | 'time' | 'gone';
export interface Badge {
  kind: BadgeKind;
  label: string;
}

interface BadgeLot {
  id: number;
  status: string;
  endTime: string;
}

/** 'Lot 007'. */
export const lotLabel = (id: number) => `Lot ${String(id).padStart(3, '0')}`;

/** Short time left for a time badge: '3d 4h', '2h 5m', '41m', '<1m'. */
export function shortLeft(ms: number) {
  const m = Math.floor(ms / 60_000);
  if (m < 1) return '<1m';
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

/**
 * Card badges, at most two: top-left is 'live' for a running lot (it replaces the lot number) or the lot number;
 * top-right is 'Ending soon!' under one hour left, else a time-left chip; an ended lot gets 'GONE!'.
 */
export function badgesFor(lot: BadgeLot, now = Date.now()): Badge[] {
  const left = new Date(lot.endTime).getTime() - now;
  if (lot.status === 'ended') return [{ kind: 'lot', label: lotLabel(lot.id) }, { kind: 'gone', label: 'GONE!' }];
  if (lot.status !== 'active' || left <= 0) return [{ kind: 'lot', label: lotLabel(lot.id) }];
  return [{ kind: 'live', label: 'Live' }, left < ENDING_MS ? { kind: 'ending', label: 'Ending soon!' } : { kind: 'time', label: shortLeft(left) }];
}

/** A price for display; never '$0' for a lot nobody has bid on. */
export const priceLabel = (price: number | null | undefined, bids: number) => (!bids || price == null ? 'No bids yet' : money(price));

/** pop-2.2: hours (not capped at 24), minutes and seconds left, two digits each. */
export function splitCountdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return { hours: pad(Math.floor(s / 3600)), minutes: pad(Math.floor((s % 3600) / 60)), seconds: pad(s % 60) };
}

/** pop-2.2: the marks announced to screen readers. */
export const MARKS = [
  { ms: 5 * 60_000, text: '5 minutes left' },
  { ms: 60_000, text: '1 minute left' },
] as const;

/** pop-2.2: the marks passed when the time left goes from prevMs to nextMs (so each fires once). */
export const marksCrossed = (prevMs: number, nextMs: number) => MARKS.filter((m) => prevMs > m.ms && nextMs <= m.ms).map((m) => m.text);
