# pop-1.1 Home: hero 'Going, going... GONE!' with the hot live lot

| File | Change |
|---|---|
| fe/src/pages/Home.tsx | `Hero`: the page's only h1 ('Going, going... GONE!', display-xl) on a zap-yellow halftone band, intro, **Browse live lots** (secondary, `#live`) and **How it works** (quiet, `#how-it-works`). `HotLot`: the first trending live lot from the same GET /api/auctions answer (home-1.1 order: most bids first) with a 'Hot lot!' speech bubble, Live badge, `Lot 007 · Category`, name, current bid in pow-red Bangers (`priceLabel`: 'No bids yet' with no bids), linking to the lot. Hidden when no lot is live. Hero + ticker show only on the unfiltered browse page. 'Trending lots' h1 became the h2 'Live lots' (mockup). |
| fe/src/components/ui/Brand.tsx | `LotGlyph`: flat gavel glyph (4.5 px ink outline, panel + pow-red fills) for lots without a photo. |
| fe/src/styles.css | 'pop-1.1' block: hero band, hot lot card (shadow-lg, hover lift), overline style, phone stacking (52 px headline). |
| e2e/pop-1-1-home-hero.spec.ts | New: hot lot shows a seeded live lot (put first through a route over the real answer) with its $110.00 bid in pow-red and opens it; with no live lots the hero stays and the card is gone (375 px, no h-scroll); Browse live lots jumps to Live lots. |
