# pop-4.1 Mobile quick bid: sticky yellow bid band on phones

| File | Change |
|---|---|
| fe/src/components/BidPanel.tsx | `MobileBidBand`: shown for a signed-in non-owner on a live lot; current bid (pow-red Bangers), 'Ends in' HH:MM:SS (`splitCountdown`), the ladder's `quickAmounts` as chips (aria-pressed, `band-chip-1/2/5`), 'N bids · You'll bid $X', and one primary 'Bid $X!' button. It calls the same `useBidAction` as the form (same pre-check, API call, reducers, toast), shows POW! on success and plain error text (`band-error`) otherwise. Own testids, so the panel's testids stay unique. |
| fe/src/pages/AuctionDetail.tsx | Renders the band as the last item of the lot grid. |
| fe/src/styles.css | 'pop-4.1' block: hidden above 640 px; at <= 640 px `position: sticky; bottom: 0` inside the lot grid (so it stops above the footer instead of covering its last link), zap-yellow with a 4 px ink top rule, 44 px chips, 56 px button; the chat launcher moves above it. |
| e2e/pop-4-1-mobile-bid.spec.ts | New (375x812): band visible, sticky, yellow and flush with the bottom of the screen; chips are the ladder amounts, picking one updates 'You'll bid'; Bid places it (panel and band price update, POW!); scrolled to the end the band sits above the footer's last link; hidden at 1280 px; a new account with no credit gets 'Bid exceeds your available credit' and no POW!. |

Decision: sticky (not fixed) positioning meets "does not cover the footer's last link" without page padding hacks.
