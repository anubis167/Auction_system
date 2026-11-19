# pop-0.3 Header: Beat'em wordmark, nav, search, Sign in

| File | Change |
|---|---|
| fe/src/components/Layout.tsx | Wordmark is live text "Beat'em" (`Beat` ink + `'em` pow-red) next to the existing mark. Guest nav: Live now (`/`), Ending soon (`/?sort=ending`), Categories (`/#categories`), Sell with us (`/login`, then on to `/auctions/new` via `state.from`). Guests get a trust **Sign in** button and a secondary **Register** button. A small effect scrolls to `location.hash` after router navigation. Customer/staff/admin nav, bid limit, user menu, staff fold-out and idle logout unchanged. |
| fe/src/pages/Home.tsx | The category chip bar carries `id="categories"` (anchor for the Categories link). |
| fe/src/styles.css | 'pop-0.3' block: panel bar on a 4 px ink rule, Bangers wordmark, Archivo 800 nav with a pow-red active rule, square outlined search, 44 px menu toggle / avatar / menu items, bid limit in pow-red Bangers. |
| e2e/pop-0-3-header.spec.ts | New: guest wordmark/rule/accent colour, the four nav links, blue Sign in, Ending soon -> sorted browse, Categories -> anchor in view, Sell with us -> sign in -> create auction; customer keeps own menu; 375 px fold-out, 44 px targets, no horizontal scroll. |

Decision: "Sell with us" is guest-only, because signed-in customers already have My goods / My Auctions in their nav, and staff do not sell.
