# pop-0.4 Footer: brand block, link columns and trust row

| File | Change |
|---|---|
| fe/src/components/Layout.tsx | `SiteFooter` rebuilt: mark + live-text wordmark (Beat + zap-yellow 'em) + the existing blurb; columns Buy (Live auctions, Ending soon, Categories, My bids), Sell (Start an auction, My goods, My auctions), Account (Credit, Dashboard, Sign in, Create an account), Help (Forgot password, Change password), all existing routes; trust row "Buyer protection" / "Secure payments" with inline stroke SVG icons (no sound words); copyright `© <year> Beat'em`. The outlined fading wordmark and the bottom quick links were removed (Sign in / Register moved into Account). |
| fe/src/styles.css | Old footer rules and the pop-0.1 interim footer rules replaced by a 'pop-0.4' block: ink ground under a 4 px ink rule, zap-yellow headings/accents, dashed trust rules, 5 -> 2 -> 1 columns at 900 / 560 px, 44 px link targets on phones. Header buttons no longer wrap. |
| e2e/pop-0-4-footer.spec.ts | New: footer on home and lot page, year, trust row, ink ground, no sound words; every footer href renders a page (guarded ones via /login), never the catch-all; 375 px columns stacked, no horizontal scroll. |

Deferred (feature_list `deferred`): newsletter band ('Sign me up!'), company/legal pages that do not exist.
