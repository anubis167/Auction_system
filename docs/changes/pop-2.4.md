# pop-2.4 Lot page: bid history and price chart restyle

| File | Change |
|---|---|
| fe/src/components/BidPanel.tsx | `BidHistory`: the viewer's own rows carry the bam-blue 'you' badge (`you` testid kept). Rows, table semantics, masked/relative times and SSE updates unchanged. |
| fe/src/styles.css | 'pop-2.4' block: stroke-heavy panel with a sky-cyan header on a 4 px ink rule, dashed row dividers, own rows on paper with a blue edge, amounts in pow-red Bangers; price chart line ink, area zap-yellow at 35 %. |
| e2e/pop-2-4-history.spec.ts | New: cyan header; a bid placed in a second browser appears at the top of the history without a reload, amount in pow-red Bangers. |

Existing ui-1b.3 and rt-001 specs pass unchanged (rt-001 only had the pop-2.3 copy update).
