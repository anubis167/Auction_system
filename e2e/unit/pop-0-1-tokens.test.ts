import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// pop-0.1: fe/src/styles.css :root holds the 'Beat it! Look' tokens (LOT-POP-Brand-Guidelines.md section 12).
const css = readFileSync(new URL('../../fe/src/styles.css', import.meta.url), 'utf8');
const root = css.match(/:root \{([\s\S]*?)\n\}/)![1];
const tokens = Object.fromEntries([...root.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

const GUIDELINE: Record<string, string> = {
  ink: '#111111', 'ink-muted': '#444444', paper: '#FFF8E7', 'paper-dot': '#F3D9A4', panel: '#FFFFFF',
  'pow-red': '#D62828', 'pow-red-dot': '#F25C5C', 'zap-yellow': '#FFD60A', 'zap-yellow-dot': '#FFB703',
  'bam-blue': '#1D4ED8', 'bam-blue-dot': '#4C7BF0', 'pop-pink': '#FF7EB6', 'pop-pink-dot': '#FF4F9A',
  'sky-cyan': '#5EE1F0', 'sky-cyan-dot': '#22B8D1',
  'font-display': '"Bangers", "Impact", "Arial Black", sans-serif', 'font-body': '"Archivo", system-ui, sans-serif',
  'space-1': '4px', 'space-2': '8px', 'space-3': '12px', 'space-4': '16px', 'space-5': '24px', 'space-6': '32px',
  'space-7': '48px', 'space-8': '72px', 'radius-0': '0px', 'radius-pill': '999px', 'radius-round': '50%',
  'stroke-thin': '2px', 'stroke-base': '3px', 'stroke-heavy': '4px',
  'shadow-sm': '3px 3px 0 #111111', 'shadow-md': '6px 6px 0 #111111', 'shadow-lg': '10px 10px 0 #111111',
  'shadow-red': '8px 8px 0 #D62828',
};

/** WCAG 2.x contrast ratio of two #rrggbb colours. */
export function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('pop-0.1 design tokens', () => {
  it('holds every guideline token with its exact value', () => {
    for (const [name, value] of Object.entries(GUIDELINE)) expect(tokens[name], name).toBe(value);
  });

  it('drops the old dark navy theme tokens', () => {
    for (const old of ['navy', 'navy-hover', 'steel', 'steel-light', 'surface', 'bg', 'crimson', 'cream']) expect(tokens[old], old).toBeUndefined();
    expect(css).not.toMatch(/var\(--(navy|steel|surface|crimson|cream|tint-[a-z]+)\)/);
    expect(css).not.toMatch(/Mulish|Stardom/);
  });

  it('text-on-colour pairs used by the token map reach 4.5:1 (body) and 3:1 (display)', () => {
    const white = '#FFFFFF';
    // White text only on pow-red, bam-blue and ink.
    for (const bg of ['pow-red', 'bam-blue', 'ink']) expect(contrast(white, GUIDELINE[bg]), `white on ${bg}`).toBeGreaterThanOrEqual(4.5);
    // Ink text on paper, panel and the light hues.
    for (const bg of ['paper', 'panel', 'zap-yellow', 'pop-pink', 'sky-cyan']) expect(contrast(GUIDELINE.ink, GUIDELINE[bg]), `ink on ${bg}`).toBeGreaterThanOrEqual(4.5);
    expect(contrast(GUIDELINE['ink-muted'], GUIDELINE.paper)).toBeGreaterThanOrEqual(4.5);
    // Prices (display) in pow-red and links in bam-blue on paper / panel.
    for (const fg of ['pow-red', 'bam-blue']) for (const bg of ['paper', 'panel']) expect(contrast(GUIDELINE[fg], GUIDELINE[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
    // The pairs the guideline forbids really are below the bar.
    expect(contrast(white, GUIDELINE['pop-pink'])).toBeLessThan(4.5);
    expect(contrast(white, GUIDELINE['zap-yellow'])).toBeLessThan(3);
  });
});
