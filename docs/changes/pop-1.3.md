# pop-1.3 Home: How it works (Spot it! Bid it! Win it!)

| File | Change |
|---|---|
| fe/src/pages/Home.tsx | `HowItWorks` section (`#how-it-works`, target of the hero button): three numbered panels with halftone number tiles; copy follows the real rules (browse/search, bid from available credit on the increment ladder, live updates, credit settles on a win). No watchlist or auto-bid wording. Shown on the unfiltered page. |
| fe/src/styles.css | 'pop-1.3' block: outlined step panels, 64 px number tiles (Bangers 40 px, so the dots sit behind display-size text only). |
| e2e/pop-1-3-how-it-works.spec.ts | New: hero button scrolls to the section, three steps in order, mentions credit, no watchlist/auto-bid. |
