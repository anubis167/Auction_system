import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { BadgeKind, SoundWord, Tone } from '../../brand';

/**
 * pop-0.2: the 'Beat it! Look' components (LOT-POP-Brand-Guidelines.md section 13), rebuilt as small React
 * components because the guideline's bundle.js is not in the repo. Styles: styles.css 'pop-0.2'.
 */

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'trust';
type ButtonProps = { variant?: ButtonVariant; size?: 'sm' | 'md' | 'lg'; href?: string; testId?: string; children: ReactNode } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>;

/** Square outlined button; primary once per view, lg for the bid button only. `href` renders a link. */
export function Button({ variant = 'quiet', size = 'md', href, testId, className = '', children, type = 'button', ...rest }: ButtonProps) {
  const cls = `btn btn-${variant} btn-${size} ${className}`.trim();
  // In-page anchors stay plain links so the browser scrolls to them.
  if (href?.startsWith('#'))
    return (
      <a href={href} className={cls} data-testid={testId}>
        {children}
      </a>
    );
  if (href)
    return (
      <Link to={href} className={cls} data-testid={testId}>
        {children}
      </Link>
    );
  return (
    <button type={type} className={cls} data-testid={testId} {...rest}>
      {children}
    </button>
  );
}

/** State label on lot art and cards. 'live' always carries a dot and the word, never colour alone. */
export function Badge({ kind, children, testId }: { kind: BadgeKind | 'you'; children: ReactNode; testId?: string }) {
  return (
    <span className={`pop-badge pop-badge-${kind}`} data-testid={testId}>
      {kind === 'live' && <span className="pop-badge-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

/** Starburst sticker with one sound word; `animate` pops it in (skipped under reduced motion), `announce` speaks it. */
export function Burst({ word, tone = 'yellow', animate, announce, className = '', testId }: { word: SoundWord; tone?: Tone; animate?: boolean; announce?: boolean; className?: string; testId?: string }) {
  return (
    <span
      className={`burst burst-${tone} ${animate ? 'is-popping' : ''} ${className}`.trim()}
      role={announce ? 'status' : undefined}
      aria-live={announce ? 'polite' : undefined}
      data-testid={testId}
    >
      <span className="burst-word">{word}</span>
    </span>
  );
}

/** 2-8 words in Bangers; `oval` for one-word shouts. Tilt 1-6 degrees either way. */
export function SpeechBubble({ children, shape = 'box', tilt = -3, className = '', testId }: { children: ReactNode; shape?: 'box' | 'oval'; tilt?: number; className?: string; testId?: string }) {
  const deg = Math.max(-6, Math.min(6, tilt));
  return (
    <span className={`speech speech-${shape} ${className}`.trim()} style={{ transform: `rotate(${deg}deg)` }} data-testid={testId}>
      {children}
    </span>
  );
}

/** Ben-Day dot field in a tone with its -dot partner (14px pitch); holds lot art, hero bands and avatars. */
export function Halftone({ tone = 'yellow', className = '', children, testId }: { tone?: Tone | 'red' | 'blue' | 'paper'; className?: string; children?: ReactNode; testId?: string }) {
  return (
    <div className={`halftone halftone-${tone} ${className}`.trim()} data-testid={testId}>
      {children}
    </div>
  );
}

/** Flat object glyph (a gavel on its block) for lots without a photo: 4.5px ink outline, two brand fills. */
export function LotGlyph({ className = 'lot-glyph' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 100" aria-hidden="true" focusable="false">
      <g stroke="#111111" strokeWidth="4.5" strokeLinejoin="round" strokeLinecap="round">
        <rect x="22" y="78" width="70" height="14" fill="#FFFFFF" />
        <g transform="rotate(-35 62 42)">
          <rect x="58" y="34" width="9" height="50" fill="#FFFFFF" />
          <rect x="38" y="12" width="48" height="24" fill="#D62828" />
        </g>
      </g>
    </svg>
  );
}
