# pop-5.1 Customer and auth pages in the brand

| File | Change |
|---|---|
| fe/src/pages/Register.tsx | On success goes to `/login` with `state.registered` (the toast and URL are unchanged). |
| fe/src/pages/Login.tsx | With `state.registered` the page opens with a pink KAPOW! burst (animated, announced) and "You're in! Confirm your email, then sign in below." The Log in button is the trust (bam-blue) button. |
| fe/src/pages/MyBiddings.tsx | A won lot shows a small BAM! burst next to its 'Won' result (`won-bam`). |
| fe/src/styles.css | 'pop-5.1' block: form labels in the overline style (Archivo 800, 13 px, uppercase, 1 px tracking) while inputs inside them keep 17 px body text; narrow auth cards with shadow-lg and display headings; small burst size; Bangers totals; square outlined credit bar (bam-blue available, pow-red locked); outlined thumbnails; 44 px quick credit amounts. Forms are never tilted. |
| e2e/pop-5-1-customer-pages.spec.ts | New: login/register/forgot-password and nine customer pages at 1280 and 375 on paper with no horizontal scroll; overline labels with body-size inputs; trust Log in; no sound word on auth, credit, change-password, profile pages; registering ends on the sign-in page with KAPOW!; a won lot in My biddings shows BAM!. |

Sound words used: KAPOW! (sign-up) and BAM! (won). None on password, credit/payment or error copy.
