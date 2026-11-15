# rag-2.4: E2E tests for admin RAG chatbox document management

SRS: with e2e function, unit and integration tests write to e2e folder.

## Changes

- `e2e/adm-006-chatbox-rag.spec.ts`:
  - Full end-to-end admin workflow testing:
    - Admin login and header navigation to `/admin/rag` via the new "Chatbot" link (Req-4).
    - Verifying uploaded documents list and chunk counts.
    - Testing >10 MB document rejection triggering the warning toast and form alert (Req-1, Req-2).
    - Testing successful document upload (<10 MB) with chunk count display (Req-1, Req-3).
    - Testing soft-delete removing the document from the table and showing notification.
    - Testing role-based access: customer (`alice`) does not see the Chatbot header link and cannot access `/admin/rag`.

## Verification

- `fe/src/adminRag.test.ts`: 3 unit tests verifying formatBytes, MAX_DOC_SIZE_BYTES, and size/extension checks.
- `npm test -w fe`: 27/27 test files passed (165 tests).
- `npm run build -w fe`: production build passed with no errors.
- `be/rag/rag_docs_test.py`: 6 integration tests on PostgreSQL verifying upload limits, chunking, and soft-delete.
- `python -m unittest discover -s be/rag -p "*_test.py"`: 37/37 tests OK.
