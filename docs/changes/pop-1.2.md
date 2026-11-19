# pop-1.2 Home: category ticker, Live lots grid with LotCards and filter chips

| File | Change |
|---|---|
| fe/src/pages/Home.tsx | Category ticker (`#categories`, ink band of Bangers links to `/?category=<id>`, static). 'Live lots' head (title, live count, sort) then the existing chips (ui-1a.2), search summary and grid; 'Just completed' uses the same cards. Cards get their grid index for tones. |
| fe/src/components/AuctionCard.tsx | Brand LotCard: halftone art panel (`toneFor(index)`, neighbours differ) with the photo or `LotGlyph`; badges from `badgesFor` (Live / lot number top-left, 'Ending soon!' sticker under 1 h / time chip / GONE! top-right; `New` tag kept); overline `Lot 007 · Category`, Bangers title, price (pow-red Bangers), bid count or 'No bids yet', ticking time left (ui-1a.1 countdown kept), winner line. Leading viewer: bam-blue 'you' badge 'Top bidder'; outbid: plain text. Art + text are one link; the quick-bid row (now 'Bid $X' secondary + 'Custom bid' quiet, same testids and behaviour) is a sibling inside the frame. |
| fe/src/styles.css | 'pop-1.2' block: ticker, section titles (display-l), `repeat(auto-fill, minmax(280px, 1fr))` grid with space-6 gap, card frame/badges/body, 44 px quick-bid buttons, grey-tinted art on ended lots. |
| e2e/pop-1-2-lot-grid.spec.ts | New: lot no, category, title, price, Live; under-1 h 'Ending soon!' vs 2 h time chip; 'No bids yet'; card link holds no button; neighbour tones differ; ticker + chip filtering; ended lot shows GONE!. |

Decision: the big price keeps the starting price for unbid lots (label 'Starting at'); 'No bids yet' replaces the bid count, so no card ever shows $0.
