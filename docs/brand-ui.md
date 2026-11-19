# Brand UI: the 'Beat it! Look' (round 15)

The site keeps its name **Beat'em**; only the look changed, from the dark navy theme (rounds 8-10) to the comic
'Beat it! Look' in `LOT-POP-Brand-Guidelines.md`, laid out after the five screens in `Pop Art Auction UI.html`.
The guideline's own name ('LOT POP!'), tagline and logo files are not used. Per-feature notes: `docs/changes/pop-*.md`.

## Tokens -> guideline section 12

`fe/src/styles.css`, first `:root` block: exactly the guideline tokens (colour + `-dot` partners, `--font-display`
/ `--font-body`, `--space-1..8`, `--radius-0/pill/round`, `--stroke-thin/base/heavy`, `--shadow-sm/md/lg/red`).
Light only (`color-scheme: light`). Fonts: Bangers + Archivo 400/600/800 from Google Fonts (`fe/index.html`).
`e2e/unit/pop-0-1-tokens.test.ts` pins the values and the contrast of the text-on-colour pairs.

The older class names (`.btn-primary`, `.ui-card`, `.badge-*`, ...) were kept; their rules now read brand tokens, and
a 'pop-0.1 base' block at the end of the file sets the guideline's base: paper ground, ink text, Archivo 17/1.6/600,
Bangers h1-h3, square 3 px outlined controls with hard shadows (hover lift -2/-2 + bigger shadow, press +3/+3),
4 px outlined panels, the 3 px bam-blue focus ring (offset 3 px) on every control, and `prefers-reduced-motion`
(no transitions or animations).

| Guideline rule | Where |
|---|---|
| White text only on pow-red / bam-blue / ink; ink on the light hues | button and badge variants in 'pop-0.1 base' and 'pop-0.2' |
| Prices are pow-red Bangers | `.lot-price-value`, `.ui-money-lg/xl`, `.hot-lot-price`, `.bid-amount`, `.band-price` |
| One `shadow-red` per page | the lot page countdown panel only |
| Square corners; round only round things | radius 0 everywhere; 50 % on avatars, chat launcher, dots; pill on counts |
| Halftone only behind art and display text | lot art, gallery frame, hero band, step numbers, chat avatar |
| Touch targets >= 44 px | 'pop-6.1' block; checked by `e2e/pop-6-1-a11y.spec.ts` |
| Chart hues >= 3:1 | `--series-1..4` = bam-blue, pow-red, ink, pop-pink-dot on the white chart panel |

## Components -> guideline section 13

| Guideline | Here | Notes |
|---|---|---|
| Button primary/secondary/quiet/trust, sm/md/lg, href | `fe/src/components/ui/Brand.tsx` `Button`; classes `.btn-primary/.btn-secondary/.btn-quiet/.btn-trust`, `.btn-sm/md/lg` | `.btn-steel` = secondary, `.btn-ghost` = quiet for older markup |
| Badge live/ending/lot/time/you | `Badge` (+ `gone`); `badgesFor()` in `fe/src/brand.ts` picks at most two per card | 'Ending soon!' only under one hour |
| Burst | `Burst`; sound words limited to `SOUND_WORDS` | POW! bid placed, BAM! won, KAPOW! sign-up, GONE! ended |
| SpeechBubble | `SpeechBubble` | 'Hot lot!', 'Questions? Holler!' |
| LotCard | `fe/src/components/AuctionCard.tsx` | art + text are one link; the quick-bid row is a sibling (ui-1a.3 kept) |
| Countdown | `CountdownPanel` in `fe/src/components/BidPanel.tsx`; `splitCountdown` / `marksCrossed` | role=timer aria-live=off; 5 min / 1 min announced politely |
| Logo | live-text wordmark "Beat'em" + the existing `fe/public/logo.svg`, recoloured pow-red on paper | |
| Icons | inline stroke SVGs (2.5-3 px, round caps); `LotGlyph` for lots without a photo | no emoji |

## Screens -> mockup

| Mockup screen | Feature | Files |
|---|---|---|
| Homepage: header, hero + hot lot, ticker, Live lots grid, How it works | pop-0.3, pop-1.1..1.3 | `Layout.tsx`, `pages/Home.tsx`, `AuctionCard.tsx` |
| Lot page | pop-2.1..2.5 | `pages/AuctionDetail.tsx`, `Gallery.tsx`, `BidPanel.tsx` |
| Chat widget | pop-3.1 | `ChatBox.tsx` |
| Footer | pop-0.4 | `Layout.tsx` `SiteFooter` |
| Mobile quick bid | pop-4.1 | `BidPanel.tsx` `MobileBidBand` (same `useBidAction` as the form) |

Customer/auth pages (pop-5.1) and staff/admin pages (pop-5.2) use the same tokens; staff/admin pages carry no
sound words.

## Deferred (no data or API yet; not faked)

- Watchlist / 'Save the ones you love' (needs a table and API).
- Auto-bid / max bid (bid engine work).
- Newsletter band 'Sign me up!' in the footer (storage + mail).
- Seller stats (verified seller, lots sold, member since, bio).
- Condition grade / inspector, specs (maker, model, serial, size, estimate), Shipping & pickup tab, returns,
  buyer's premium, ships-from (new goods fields).
- Footer pages that do not exist (About, Careers, Press, Blog, Seller handbook, Terms, Privacy, Cookies).
- Mockup chat chips 'How does auto-bid work?' / 'Shipping costs?' replaced by questions the site can answer.
