# pop-2.3 Lot page: bid panel with quick bid, Place bid! and POW! burst

| File | Change |
|---|---|
| fe/src/components/BidPanel.tsx | The bid call moved into `useBidAction(auction, bids, onReload)` (pre-check with the server wording, POST, the same Redux reducers, toast, reload on refusal) so the phone band (pop-4.1) uses the same path. `PowBurst`: a POW! `Burst` (animate + role=status aria-live=polite) pinned to the bid card corner after each successful bid, never while an error shows. Current bid in pow-red Bangers (display-m), bid count beside it. Standing: leading = bam-blue 'you' badge "You're the top bidder!"; outbid = plain "You've been outbid — jump back in?". Quick bids (`quickAmounts` / QUICK_STEPS 1, 2, 5) are secondary buttons; **Place bid! $X** is the primary lg button; 'Minimum next bid $X' line. Credit pre-check, credit lock, realtime update unchanged. Buyer's premium / ships-from not shown (no data). |
| fe/src/styles.css | 'pop-2.3' block: bid card, Bangers money input, square error box, POW position. |
| e2e/ui-1b-2-bid-panel.spec.ts, e2e/rt-001-realtime-bids.spec.ts | Expected copy updated for the rebrand only ('Place bid! $110.00', "You're the top bidder!", "You've been outbid — jump back in?"); every check kept. |
| e2e/pop-2-3-bid-panel.spec.ts | New: Place bid! is primary lg on pow-red, quick bids secondary, minimum line; over-credit bid shows the plain error and no POW!; a valid bid shows POW! in a polite status region and the blue 'you' badge; another bidder's bid shows the outbid text with no sound word. |
