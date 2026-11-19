# LOT POP! — brand guidelines

LOT POP! is an online auction house for vintage, design and collectibles. The brand looks and talks like a 1960s comic page: Ben-Day halftone dots, thick black ink outlines, hard offset shadows, flat primary colour and shouted lettering. Auctions are thrilling — the brand makes every bid feel like a panel where something goes **POW!**

> **Auctions with a bang.** Get the good stuff before the hammer drops.

## 1. Brand idea

- **Thrill, not stress.** Countdowns and outbids are drama, told with comic energy, never anxiety or fake scarcity.
- **Loud frame, clear content.** The frame (outlines, dots, bursts) is loud so the content inside (titles, prices, times) can stay plain and readable.
- **Collector's warmth.** Behind the noise sits real expertise: condition reports, provenance and honest descriptions.

## 2. Voice & tone

We sound like a friendly auctioneer who reads comics: quick, punchy and warm.

| Do | Don't |
| --- | --- |
| Short lines. "Spot it! Bid it! Win it!" | Long, formal sentences in headlines |
| One onomatopoeia per moment: **POW!** on a bid, **BAM!** on a win, **KAPOW!** on a sign-up | Sound words on every element, or on errors and payments |
| Plain, exact detail in descriptions, condition and fees | Jokes in legal, payment or condition copy |
| "You're the top bidder!" · "You've been outbid — jump back in?" | "HURRY!!! ONLY 2 LEFT!!!" or invented urgency |
| Sentence case in body; Bangers headlines can shout | ALL CAPS paragraphs |

**Sound-word bank:** POW! (bid placed) · BAM! (won) · ZAP! (live/new) · WHOA! (a big reveal) · KAPOW! (sign-up) · Holler! (chat) · GONE! (sold).
**Never** use sound words in error messages, payment flows, legal text or condition reports.

## 3. Logo

- **Wordmark:** "LOT POP!" set in Bangers, *LOT* in `ink`, *POP!* in `pow-red` (or `zap-yellow` on dark ground). Never redraw, stretch, outline or rotate it.
- **Mark:** the yellow starburst with a red "!" (`assets/Logos/lotpop-mark.svg`). Use it next to the wordmark in the header, or alone as an app icon or favicon. The one-colour ink version (`lotpop-mark-ink.svg`) is for single-colour print and stamps.
- **Clear space:** keep at least the height of the "!" clear around the mark; a minimum of `space-5` (24px) around the wordmark.
- **Minimum size:** mark 24px; wordmark 28px cap height.

## 4. Colour

Five loud hues plus ink and paper. Each hue has a darker **-dot** partner for halftone patterns.

| Role | Token | Use it for |
| --- | --- | --- |
| Ink | `ink` | Outlines, shadows, body text |
| Paper | `paper` | Page ground |
| Panel | `panel` | Cards, inputs, bubbles |
| Action | `pow-red` | Bid buttons, prices, LIVE |
| Highlight | `zap-yellow` | Timers, stickers, secondary buttons |
| Trust / you | `bam-blue` | Sign in, "you're winning", focus ring |
| Accent | `pop-pink`, `sky-cyan` | Panels, chips, variety in lot art |

**Proportion:** roughly 50% paper and panel, 20% ink, 30% colour. Use no more than three hues in one view, plus ink and paper.

**Text-on-colour rules (contrast-checked):**
- White text: only on `pow-red` (5:1), `bam-blue` (6.7:1) and `ink`.
- Ink text: on `paper`, `panel`, `zap-yellow`, `pop-pink`, `sky-cyan`.
- **Never** white on `pop-pink`, `zap-yellow` or `sky-cyan`. When display type in white sits on a light hue, it must carry a 1.5–3px ink text-stroke plus a hard ink text-shadow, and stay 48px or larger.

## 5. Typography

- **Bangers** (display) for headlines, prices, buttons that shout, stickers and sound words. Always tracked +1–2px. Uppercase comes naturally to the face; don't add `text-transform` to Bangers.
- **Archivo** (text) for everything people read: descriptions, labels, forms and chat. Semibold (600) is the default weight; 800 for labels and overlines.
- Load both from Google Fonts: `Bangers` and `Archivo:wght@400;600;800`.
- Prices are always Bangers in `pow-red`. Use `display-s` on cards and `display-m` or larger on lot pages.

## 6. Halftone dots (Ben-Day)

The signature texture. A field colour with a dot grid in its `-dot` partner:

```css
background-color: var(--zap-yellow);
background-image: radial-gradient(var(--zap-yellow-dot) 24%, transparent 25%);
background-size: 14px 14px;
```

- Pitch: 12–14px. Dot size: 20–25% of the pitch.
- Put dots on **image panels, hero bands, avatars and section bands**, never behind text smaller than 24px.
- Use only one dot colour per field. Paper dots (`paper-dot`) make a quiet page texture.

## 7. Outlines, shadows & shape

- Everything that holds content has an ink outline: `stroke-base` (3px) for controls, `stroke-heavy` (4px) for cards and panels.
- Shadows are hard and unblurred, down-right: `shadow-sm`, `shadow-md` or `shadow-lg`. One `shadow-red` per page for urgency (the countdown).
- Corners are square (`radius-0`). Round only round things: the chat launcher, avatars and oval bubbles (`radius-round`).
- Tilt stickers and bubbles by 1–6°, never body panels or forms.
- **Hover:** lift with `translate(-2px,-2px)` and grow the shadow. **Press:** push in with `translate(3px,3px)` and shrink the shadow.

## 8. Layout

- Max content width 1280px with a `space-5` gutter. Use `space-8` vertical rhythm between sections.
- Lot grids are `repeat(auto-fill, minmax(280px, 1fr))` with a `space-6` gap.
- Separate page regions with heavy 4px ink rules, like comic gutters.
- On phones, columns stack, toolbars wrap and the bid button sticks to the bottom in a yellow band.

## 9. Iconography & illustration

- **Icons:** inline stroke SVGs, 2.5–3px stroke, round caps, in `ink` (or `zap-yellow` on ink). Never emoji.
- **Lot art when photos are missing:** a flat object glyph (camera, chair, guitar…) with a 4–5px ink outline and 1–2 brand fills, centred on a halftone panel. Real photos sit in the same panel frame with an ink outline.
- No mascots, faces or copies of existing comic artwork. The style is ours; the characters aren't anyone's.

## 10. Motion

- **POW pop:** stickers scale from 0.2 to 1.15 and then to 1 with a slight rotation, over 400ms ease-out. Use it when a bid lands or a win is confirmed.
- Hover lifts take 120–150ms. Nothing loops, flashes or shakes.
- Respect `prefers-reduced-motion`: show the final state with no animation.

## 11. Accessibility

- Body text must reach 4.5:1 and display text 3:1. Follow the text-on-colour rules above.
- Keyboard focus is a 3px `bam-blue` outline, offset 3px, on every control.
- Colour never carries meaning alone: LIVE also has a dot and a word, and ending soon has the word as well as the colour.
- Touch targets are at least 44px. Countdowns use `role="timer"`, and bid confirmations are announced with `aria-live="polite"`.

## 12. Design tokens

### Colour

| Token | Value | Usage |
| --- | --- | --- |
| `ink` | `#111111` | Every outline, hard shadow and body text. Text on paper, panel, zap-yellow, sky-cyan and pop-pink. |
| `ink-muted` | `#444444` | Secondary text on paper or panel only (9:1 on paper). Never on colour blocks. |
| `paper` | `#FFF8E7` | Page background — warm comic-book paper. Never pure white for the page. |
| `paper-dot` | `#F3D9A4` | Halftone dots on paper for quiet textured areas. Decoration only, never text. |
| `panel` | `#FFFFFF` | Card, input and speech-bubble fill, always inside an ink outline. |
| `pow-red` | `#D62828` | Primary action (Place bid!), prices, LIVE tags, the POP! in the wordmark. White text on it passes 5:1; ink text does not read well — use white. |
| `pow-red-dot` | `#F25C5C` | Halftone dots on pow-red fields. Decoration only. |
| `zap-yellow` | `#FFD60A` | Highlight, timers, burst stickers, secondary buttons. Ink text only (13:1). |
| `zap-yellow-dot` | `#FFB703` | Halftone dots on zap-yellow fields. Decoration only. |
| `bam-blue` | `#1D4ED8` | Sign in, links on hover, category overlines, 'you are winning' states, focus ring. White text on it passes 6.7:1. |
| `bam-blue-dot` | `#4C7BF0` | Halftone dots on bam-blue fields. Decoration only. |
| `pop-pink` | `#FF7EB6` | Accent fields and stickers. Ink text only — white on pink fails (2.4:1). |
| `pop-pink-dot` | `#FF4F9A` | Halftone dots on pop-pink fields. Decoration only. |
| `sky-cyan` | `#5EE1F0` | Info panels (bid history header), online dots, cool accent. Ink text only. |
| `sky-cyan-dot` | `#22B8D1` | Halftone dots on sky-cyan fields. Decoration only. |

### Type families

| Key | Stack |
| --- | --- |
| `display` | `"Bangers", "Impact", "Arial Black", sans-serif` |
| `body` | `"Archivo", system-ui, sans-serif` |

Load from Google Fonts: `https://fonts.googleapis.com/css2?family=Bangers&family=Archivo:wght@400;600;800&display=swap`

### Type styles

| Style | Family | Size | Line height | Weight | Tracking | Usage |
| --- | --- | --- | --- | --- | --- | --- |
| `display-xl` | display | 132px | 0.88 | 400 | 2px | One hero headline per page. Add a 3px ink text-stroke and a 7px hard ink text-shadow when set on colour. |
| `display-l` | display | 72px | 0.9 | 400 | 2px | Section titles. |
| `display-m` | display | 56px | 1 | 400 | 1.5px | Lot titles, big prices, step headings. |
| `display-s` | display | 32px | 1.05 | 400 | 1px | Card titles, panel headers, primary button labels. |
| `burst` | display | 24px | 1.1 | 400 | 1px | Stickers, speech bubbles, quick-bid buttons, onomatopoeia. |
| `body-l` | body | 20px | 1.5 | 600 | 0 | Hero intro, lead paragraphs. |
| `body` | body | 17px | 1.6 | 600 | 0 | Default running text. Semibold, because thin text disappears next to heavy outlines. |
| `body-s` | body | 14px | 1.5 | 600 | 0 | Meta lines, footnotes, chat messages. |
| `overline` | body | 13px | 1.2 | 800 | 1px | Uppercase labels above titles, form labels, tag text. |
| `button` | body | 15px | 1 | 800 | 0.5px | Small utility buttons and filters, uppercase. Big actions use display-s instead. |

### Spacing

| Token | Value | Usage |
| --- | --- | --- |
| `space-1` | `4px` | Icon-to-text nudges. |
| `space-2` | `8px` | Tag padding, tight gaps. |
| `space-3` | `12px` | Gaps between chips and quick-bid buttons. |
| `space-4` | `16px` | Small card padding, button gaps. |
| `space-5` | `24px` | Page gutter, card padding, halftone pitch on covers. |
| `space-6` | `32px` | Grid gap between lot cards. |
| `space-7` | `48px` | Gap between page columns. |
| `space-8` | `72px` | Vertical section padding. |

### Radius

| Token | Value | Usage |
| --- | --- | --- |
| `radius-0` | `0px` | The default. Panels, cards, buttons and inputs are square, like comic frames. |
| `radius-pill` | `999px` | Notification counts only. |
| `radius-round` | `50%` | Round things only: the chat launcher, avatars, oval speech bubbles. |

### Stroke (outline widths)

| Token | Value | Usage |
| --- | --- | --- |
| `stroke-thin` | `2px` | Dashed dividers inside cards and lists. |
| `stroke-base` | `3px` | Buttons, inputs, tags, chips, small cards. |
| `stroke-heavy` | `4px` | Page header/footer rules, lot cards, big panels, the primary bid button. |

### Shadow

| Token | Value | Usage |
| --- | --- | --- |
| `shadow-sm` | `3px 3px 0 #111111` | Chips, filters, small buttons. |
| `shadow-md` | `6px 6px 0 #111111` | Buttons, stickers, standard cards. Hover lifts by translate(-2px,-2px) and grows to shadow-lg. |
| `shadow-lg` | `10px 10px 0 #111111` | Hero card, image panel, chat panel. |
| `shadow-red` | `8px 8px 0 #D62828` | Once per page, on the countdown panel, for urgency. |

### CSS variables

```css
:root {
  --ink: #111111;
  --ink-muted: #444444;
  --paper: #FFF8E7;
  --paper-dot: #F3D9A4;
  --panel: #FFFFFF;
  --pow-red: #D62828;
  --pow-red-dot: #F25C5C;
  --zap-yellow: #FFD60A;
  --zap-yellow-dot: #FFB703;
  --bam-blue: #1D4ED8;
  --bam-blue-dot: #4C7BF0;
  --pop-pink: #FF7EB6;
  --pop-pink-dot: #FF4F9A;
  --sky-cyan: #5EE1F0;
  --sky-cyan-dot: #22B8D1;
  --font-display: "Bangers", "Impact", "Arial Black", sans-serif;
  --font-body: "Archivo", system-ui, sans-serif;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;
  --space-8: 72px;
  --radius-0: 0px;
  --radius-pill: 999px;
  --radius-round: 50%;
  --stroke-thin: 2px;
  --stroke-base: 3px;
  --stroke-heavy: 4px;
  --shadow-sm: 3px 3px 0 #111111;
  --shadow-md: 6px 6px 0 #111111;
  --shadow-lg: 10px 10px 0 #111111;
  --shadow-red: 8px 8px 0 #D62828;
}
```

## 13. Components

All components ship in `components/bundle.js` as `window.LotPop` (React 18), styled by `components/bundle.css`.

### Button

Square, outlined, hard-shadowed buttons that lift on hover and push in on press.

- **primary** (`pow-red`, white Bangers with an ink stroke): the one action the view is for, such as "Place bid!". Use it once per view.
- **secondary** (`zap-yellow`): supporting actions such as "Browse live lots" or quick-bid amounts.
- **quiet** (`panel`): neutral actions such as "How it works".
- **trust** (`bam-blue`): account actions such as "Sign in".
- Sizes: `sm` is Archivo 800 uppercase for filters and utilities; `md` and `lg` are Bangers. `lg` is for the bid button only.
- Labels are verb-first and short. An exclamation mark is fine on primary only ("Place bid!", "Sign me up!").
- Pass `href` to render a link that looks like a button.

### Badge

Small outlined labels that sit on lot art and cards to say what state a lot is in.

- **live**: `pow-red` with a dot and the word "Live". Never use the colour alone.
- **ending**: a tilted ink sticker with "Ending soon!" in `zap-yellow` Bangers. Use it only under one hour.
- **lot**: a neutral panel label such as "Lot 007".
- **time**: a `zap-yellow` time-left chip such as "41m".
- **you**: `bam-blue` for "You're the top bidder!".
- Use at most two badges per card, one top-left and one top-right.

### Burst

A starburst sticker carrying one sound word, which pops in when something good happens.

- Use one burst per moment: **POW!** when a bid is placed, **BAM!** on a win, **KAPOW!** on sign-up, **ZAP!** for new or live.
- Never use it for errors, outbids, payments or anything legal.
- Set `animate` for the 400ms POW pop (it is skipped under reduced motion) and `announce` so screen readers hear the change.
- Pin it to a panel corner so it overlaps the outline, tilted by about −4°.
- Tones: yellow with red letters (the default), pink with white letters (an ink stroke is required), cyan with blue letters.

### SpeechBubble

A comic speech bubble for short asides: a seller's quote, a "Hot lot!" callout or a chat teaser.

- Keep it to 2–8 words in Bangers. Anything longer belongs in body text.
- `box` (the default) for quotes; `oval` for shouty one-word callouts.
- Tilt by 1–6° and let it overlap a panel edge. Never put one over a price or a button.
- Write it in the brand's voice: "Mint glass, works perfectly!" or "Questions? Holler!"

### LotCard

The core browse unit: a halftone art panel over a white body with the category, title, current bid and time left.

- The consumer provides `art`: a real photo (`<img>` with `object-fit: cover`) or a flat object glyph SVG with a 4–5px ink outline.
- Vary `tone` across a grid so neighbouring cards never share a colour.
- The price is always pre-formatted and shown in `pow-red` Bangers. If the price is unknown, show "No bids yet" rather than $0.
- Set `ending` only when under one hour is left; `live` replaces the lot-number badge.
- Grid: `repeat(auto-fill, minmax(280px, 1fr))` with a `space-6` gap. The whole card is one link, so put no nested buttons inside it.

### Countdown

A panel showing the time left on a lot as hours, minutes and seconds in comic boxes, on ink with the page's single `shadow-red`.

- Use one per lot page, next to the current bid. On cards, use a `time` Badge instead.
- Seconds sit in a white box with `pow-red` digits; hours and minutes sit in `zap-yellow` boxes.
- `role="timer"` with `aria-live="off"`, so screen readers aren't spammed every second. Announce the 5-minute and 1-minute marks separately.
- The consumer supplies `seconds` from the server clock. `live` ticks it down locally.

## 14. Logo files

- `lotpop-mark.svg`: the full-colour starburst mark. A `zap-yellow` burst with an ink outline and a `pow-red` "!". Use it on paper, panel or ink grounds.
- `lotpop-mark-ink.svg`: a one-colour version in `ink`, with the "!" knocked out to `paper`. Use it for single-colour print, stamps and embossing.

The wordmark is live text, not a file: "LOT POP!" in Bangers, with *LOT* in `ink` and *POP!* in `pow-red`.
