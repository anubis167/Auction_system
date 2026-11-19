# rag-2.3: Admin RAG document management page with upload, 10MB validation, notifications, and soft delete

SRS Req-1, Req-2, Req-3: admin side handle upload RAG (<10mb), notification if bigger, list and soft delete.

## Changes

- `fe/src/pages/AdminRag.tsx`:
  - Knowledge document list fetched from GET `/api/docs` with title, filename, size, chunk count, creation date, and delete action.
  - Form to upload `.txt` or `.md` files up to 10 MB (`MAX_DOC_SIZE_BYTES = 10 * 1024 * 1024`) with an optional title.
  - Client-side validation: if selected file is >= 10 MB, immediately notifies via toast error notification (`File exceeds the 10 MB limit`) and displays inline error, blocking upload.
  - Upload submission sends multipart request to POST `/api/docs`, notifies with success toast on completion, and reloads the table.
  - Soft delete: clicking Delete sends DELETE `/api/docs/:id`, shows success toast, and removes the document from active display.
- `fe/src/adminRag.test.ts`:
  - Unit tests for byte size formatting (`formatBytes`), 10 MB limit constant (`MAX_DOC_SIZE_BYTES`), and file extension/size validation functions.

## Verification

- `npm test -w fe`: 27/27 test files passed (165 tests).
- `npm run build -w fe`: production build passed with no errors.
