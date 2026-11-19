# pop-5.2 Staff and admin pages in the brand

| File | Change |
|---|---|
| fe/src/styles.css | Chart series re-coloured to brand hues: `--series-1` bam-blue, `-2` pow-red, `-3` ink, `-4` pop-pink-dot (each >= 3:1 on the white chart panel; legends keep the word next to each swatch). 'pop-5.2' block: 3 px outlined chart panels, square swatches and tooltip, table header on paper over a 3 px ink rule, row hover on paper, dashed row dividers (pop-0.1 base), tighter filter rows. Status badges already pair a word with the colour (pop-0.1). |
| e2e/pop-5-2-staff-pages.spec.ts | New: staff statistics/auctions/goods/credit/chats and admin users/new user/permissions render on paper at 1280 with no horizontal scroll and no sound words; chart series are the brand hues at >= 3:1 on the panel; table cells use dashed dividers. |

No sound words on staff/admin pages (business tools). Existing stf-*, adm-*, sec-* specs unchanged.
