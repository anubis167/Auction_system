# pop-6.1 Accessibility gate and full-path walk-through

| File | Change |
|---|---|
| fe/src/styles.css | 'pop-6.1' block: 44 px minimum height for `.link-button`, header search fields, small buttons and quick bids on phones; breadcrumb, ticker and auth-card links get 44 x 44 px hit areas on phones. |
| e2e/pop-6-1-a11y.spec.ts | New: Tab through home, lot, login, register, forgot-password: every stop shows `solid 3px rgb(29, 78, 216)` offset 3 px; chat input too. At 375 px every visible control (buttons, inputs, selects, button links, nav links, tabs) in the header, main and chat is >= 44 x 44 px, on the same pages plus the open chat and the signed-in lot page with the bid band. Live badge = dot + word; ending soon = the word. |
| e2e/pop-6-1-full-path.spec.ts | New: guest home -> Register (header) -> KAPOW! -> activation link signs in -> credit top-up approved by staff (bid limit $500.00) -> seller lists a lot -> Place bid! -> POW! and top-bidder badge (bid limit $380.00) -> close job settles -> My biddings 'Won' with BAM! -> lot page GONE! with the winner and the ended message. |
| docs/brand-ui.md | New: how the tokens/components/screens map to the guideline and mockup, and what was deferred. |
| docs/design-system.md | Pointer to docs/brand-ui.md (the round 8-10 dark tokens it describes were replaced). |
