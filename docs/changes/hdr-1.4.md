# hdr-1.4 Staff and admin role links in one Dashboard menu

Recorded after the fact (session 023, 2026-11-09). The code shipped in commit 438bbe0 together with hdr-1.1 to hdr-1.3, without its own feature entry or change note.

## Change

- `fe/src/components/Layout.tsx` (`.nav-dashboard`): on desktop the staff/admin role links (Statistics, Manage auctions, Goods, Credit management, Users, Permissions; each still shown only with its permission) sit in one "Dashboard" dropdown right of the search. The toggle is marked active on any role page; choosing a link closes the menu.
- Result: the staff/admin bar is one row again at every desktop width (Browse | search | Dashboard menu | role pill, avatar), instead of hdr-1.3's search on its own row.
- At 900px and below the folding menu lists Browse and every role link flat, as before.

## Tests

- `e2e/hdr-1-2-staff-admin-header.spec.ts` (written for this layout) and `e2e/helpers.ts` `openRoleNav()`.
- Note: the hdr-1-* specs were removed from `e2e/` in session 019 at the user's request. They are kept in git history (438bbe0) and were run from there in session 023.
