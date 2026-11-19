# Merge: feature/claude-staff (round 15 'Beat it! Look') into main - 2026-11-19

Brings the branch's work since the 2026-11-18 merge onto main: the rag2 round 14 verification and archive, the
`/api/chat/health` + ChatBox offline state, and the round 15 restyle (pop-0.1 .. pop-6.1, see docs/brand-ui.md).

## Conflicts and how they were resolved
- `claude-progress.md`: both sides appended sessions; both kept (main's gemini sessions and merge note first, then
  the branch's sessions 026-028) plus a merge entry.
- `progress-feature-list/feature_list_14.json` / `_15.json` (add/add): the two agents number their archives on
  their own. Main's files stay as they were (docs/changes/merge-rag2-rag3.md: gemini rounds 13 and 14). The branch's
  archives were added at the next free numbers:
  - `feature_list_16.json`: Claude's round 14 (rag2-1.1 .. 1.6, RAG rebuild on the API).
  - `feature_list_17.json`: round 15 'Beat it! Look' restyle (pop-0.1 .. pop-6.1, 17/17 passing).
  References in claude-progress.md and session-handoff.md were updated to the new names.
- `be/rag/chat.py`, `fe/src/components/Layout.tsx`: changed on both sides, merged automatically without conflict.


- `LOT-POP-Brand-Guidelines.md`, `Pop Art Auction UI.html`: were untracked on main and byte-identical to the
  branch's committed copies; the untracked copies were moved aside and the committed ones merged in.

## Verified (merged tree, 2026-11-19)
- `COMPOSE_PROJECT_NAME=auction_system ./init.sh`: be vitest 416/416, fe vitest 165/165, fe build, Python 102 OK,
  Playwright 113 passed / 2 failed.
- The 2 failures fail identically on main before this merge (8d5d81e, run in a temporary worktree), so they are
  not caused by it. Both are gemini-side specs never run on main before:
  - `e2e/adm-006-chatbox-rag.spec.ts` looks for a visible 'Chatbot' header link for admin, but admin's eight role
    links fold into the header 'Dashboard' menu at 1280 px (hdr-1.4); the spec does not open it (`openRoleNav`).
  - `e2e/rag-chat-api.spec.ts` Req-1 expects `{ error: 'Forbidden' }` from gemini's dropped `be/rag/auth.py`; the
    403 now comes from Node's `requirePermission` ('You do not have permission to do this').
