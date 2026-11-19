# pop-2.1 Lot page: breadcrumb, halftone gallery and lot header

| File | Change |
|---|---|
| fe/src/pages/AuctionDetail.tsx | Breadcrumb `Home / <Category> / Lot 007`. The aside starts with the lot head (`data-testid=lot-info`): overline `Lot 007 · Category · seller` (`lot-meta`), the title as the page h1 (display-m), 'No reserve' tag, a 220-character excerpt of the description and **Read the full description** (opens and focuses the Description tab, pop-2.5). Bid card and history follow; gallery, tabs and messages sit in the main column. The raw status badge (`status` testid) moved into the facts table. |
| fe/src/components/Gallery.tsx | Hero image inside a sky-cyan halftone frame (4 px ink, shadow-lg) with the `badgesFor` badges overlaid (Live, Ending soon!, GONE!, lot number). No image: the frame holds `LotGlyph` (`gallery-placeholder` kept). Thumbnails stay buttons (aria-pressed, focus ring); the selected one gets a pow-red outline. Lightbox arrows are inline SVG chevrons instead of text glyphs. |
| fe/src/styles.css | 'pop-2.1' block: layout gaps, breadcrumb, gallery frame/badges/thumbnails, lot head, `.link-button`. |
| (gate fix) | A visible "Sold by <seller>" line stays under the title (sell-001 relies on it); the Seller tab says "Seller: <name>" so the text is not duplicated. |
| e2e/pop-2-1-lot-header.spec.ts | New: breadcrumb text and category link, meta line with the seller username, Live badge, thumbnails by keyboard (Tab + Enter switches the hero), Read the full description opens the tab. |
