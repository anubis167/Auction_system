# rag-2.2: Admin navigation link and route for RAG management

SRS Req-4: put new navigation link into header for admin.

## Changes

- `fe/src/components/Layout.tsx`:
  - Added `{ to: '/admin/rag', label: 'Chatbot', permission: 'user.manage' }` to `ROLE_LINKS`.
  - Accessible only to admin users who have the `user.manage` permission (regular customers and visitors do not see the link).
- `fe/src/App.tsx`:
  - Registered route `/admin/rag` guarded by `<RequireAuth permission="user.manage">`.
- `fe/src/pages/AdminRag.tsx`:
  - Created initial component for `/admin/rag`.

## Verification

- `npm test -w fe`: 27/27 test files passed (165 tests).
- `npm run build -w fe`: production build passed with no TypeScript or bundle errors.
