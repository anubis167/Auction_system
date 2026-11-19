# pop-0.2 Brand components and rules

Source: LOT-POP-Brand-Guidelines.md section 13. The guideline's `components/bundle.js` (window.LotPop) is not in the repo, so the components are small React components.

| File | Change |
|---|---|
| fe/src/brand.ts | New, pure rules: `SOUND_WORDS` / `isSoundWord`, `TONES` / `toneFor(i)` (cycles yellow/pink/cyan, neighbours differ), `badgesFor(lot, now)` (max 2: 'Live' replaces the lot number on a running lot, 'Ending soon!' under 1 h else a time chip, 'GONE!' on ended lots), `lotLabel`, `shortLeft`, `priceLabel(price, bids)` ('No bids yet' instead of $0), plus the countdown helpers used by pop-2.2 (`splitCountdown`, `marksCrossed`). |
| fe/src/components/ui/Brand.tsx | New: `Button` (primary/secondary/quiet/trust x sm/md/lg; `href` renders a router Link, a `#hash` href a plain anchor), `Badge` (live with dot + word, ending tilted ink sticker, lot, time, you, gone), `Burst` (sound word only, tones, `animate` = 400 ms POW pop, `announce` = role=status aria-live=polite), `SpeechBubble` (box/oval, tilt clamped to 6 deg), `Halftone` (tone + its -dot partner, 14 px pitch). |
| fe/src/components/ui/index.ts | Exports the new components. |
| fe/src/styles.css | 'pop-0.2' block: button sizes (sm Archivo 800 uppercase, md/lg Bangers), badges, starburst (clip-path, ink rim), POW pop keyframes (off under reduced motion via pop-0.1), speech bubbles, halftone fields; Card / SegmentedTabs / SearchInput / MoneyText / ConfirmDialog restyled with the same props (square, 3 px ink, yellow active tab, 44 px tabs). |
| e2e/unit/pop-0-2-brand-rules.test.ts | New: badgesFor (59 m vs 61 m, live vs lot, ended, max 2), labels, isSoundWord, toneFor neighbours, priceLabel. |

Icons stay inline stroke SVGs; the UI has no emoji (typographic arrows/bullets only).
