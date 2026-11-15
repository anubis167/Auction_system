# sch-1.1 Test layout under e2e/

SRS (staff chat panel) asks for unit and integration tests in the `e2e/` folder. No new Playwright specs this round.

## Where tests go

| Folder | Runner | Run by |
|---|---|---|
| `e2e/unit/*.test.ts` | be's vitest (be env, `auction_test` db) | `npm test -w be` |
| `e2e/integration/*.test.ts` | be's vitest; import `app`/helpers from `be/tests/helpers` | `npm test -w be` |
| `e2e/py/*_test.py` | `python -m unittest` | `npm run test:py` |
| `e2e/*.spec.ts` | Playwright (unchanged) | `npm run e2e` |

## Changed files

- `be/vitest.config.ts`: `include` adds `../e2e/unit/**` and `../e2e/integration/**` next to `tests/**`.
- `playwright.config.ts`: `testMatch: '**/*.spec.ts'`, so Playwright skips the vitest `*.test.ts` files in e2e/.
- `package.json`: `test:py` runs a second discover over `e2e/py`. Both runs set dummy `GEMINI_API_KEY` and `NGROK_AUTHTOKEN`:
  `be/rag/chat.py` builds the Gemini client and sets the ngrok token on import, and every Python test mocks the client.
  Without this the Python suite failed to import in a checkout with no `be/.env` (this worktree).
- New placeholders: `e2e/unit/sch-1-1-layout.test.ts`, `e2e/integration/sch-1-1-layout.test.ts`, `e2e/py/sch_1_1_layout_test.py`.
