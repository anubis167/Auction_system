# pop-2.5 Lot page: Description / Condition / Seller tabs and facts table

| File | Change |
|---|---|
| fe/src/pages/AuctionDetail.tsx | `LotTabs`: WAI-ARIA tablist 'Lot details' with manual activation (Arrow keys / Home / End move focus, Enter or Space selects), tab colours yellow / cyan / panel. Description = the auction description; Condition = goods condition label plus "Have a question about condition? Ask the auction desk in the chat" (opens the chat widget); Seller = seller username and 'See more lots from this seller' (existing search with `field=seller`). Facts table: category, condition, starting price, starts, ends (`end-time`), status (`status` badge), winner (`winner`), each only when the lot has it. The 'Shipping & pickup' tab is deferred (no data). |
| fe/src/components/ChatBox.tsx | Opens on a window `open-chat` event (used by the Condition tab). |
| fe/src/styles.css | 'pop-2.5' block: tab strip, panel, dashed facts divider; lot messages as outlined speech-bubble rows (Messages.tsx unchanged, same closing rules). |
| e2e/pop-2-5-lot-tabs.spec.ts | New: tabs by keyboard (arrow moves focus without selecting, Enter/Space select), condition text, seller link, chat opens from the condition link, starting price in the facts, no '[' placeholder text on the page. |
