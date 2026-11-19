# pop-2.2 Lot page: comic Countdown panel

| File | Change |
|---|---|
| fe/src/components/BidPanel.tsx | `CountdownPanel` at the top of the bid card: ink panel with the page's single `shadow-red`; the existing 'Ends in 59m 58s' line (`countdown` testid, ui-1b.2) is the `role=timer` with `aria-live=off`; below it HRS : MIN : SEC boxes (hours/minutes zap-yellow, seconds white with pow-red digits, `aria-hidden`). A separate `aria-live=polite` region (`countdown-announce`) says '5 minutes left' and '1 minute left' once each, including when the page is opened inside a mark. Driven by the API end time, ticking locally; ended/upcoming/cancelled lots keep the existing text and drop the boxes and the red shadow. |
| fe/src/brand.ts | `splitCountdown(ms)` (two-digit hours not capped at 24, minutes, seconds) and `marksCrossed(prevMs, nextMs)`. |
| fe/src/styles.css | 'pop-2.2' block. |
| e2e/unit/pop-2-2-countdown.test.ts | New: splitCountdown (0, negative, 59 s, 1h1m1s, 30 h) and marksCrossed (each mark once over a 6-minute countdown, opening inside a mark, jumps). |
| e2e/pop-2-2-countdown.spec.ts | New: timer role with aria-live=off, ticking seconds box, shadow-red; with the browser clock 4 minutes before the end the polite region says '5 minutes left', then after fast-forwarding '1 minute left'. |
