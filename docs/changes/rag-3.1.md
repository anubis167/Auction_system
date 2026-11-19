# rag-3.1: Global API error handling middleware with structured JSON responses

SRS Req-3: Api error handle global - catch all unexpected errors; api error should return expected error.

## Changes

- `be/rag/error_handler.py`:
  - Created global error handling module defining `register_error_handlers(app)`.
  - Implemented structured JSON error response factory returning `{"error": "<message>"}` with Content-Type `application/json`.
  - Registered error handlers for standard HTTP error statuses:
    - 400: Bad Request
    - 401: Authentication required / Unauthorized
    - 403: Forbidden / Permission denied
    - 404: Not Found
    - 405: Method Not Allowed
    - 413: Payload Too Large
    - 429: Too Many Requests
  - Registered catch-all handler for unhandled exceptions (`Exception`), logging traceback and returning HTTP 500 `{"error": "Internal server error"}` without exposing internal stack traces.

- `be/rag/chat.py`:
  - Imported and invoked `register_error_handlers(app)` to enforce structured JSON error handling across all chat and RAG API routes.

- `be/rag/error_handler_test.py`:
  - Created 5 unit tests validating:
    - Structured JSON output format across standard HTTP error codes (400, 401, 403, 413, 429).
    - HTTP 404 Not Found returns JSON `{"error": "Not Found"}`.
    - HTTP 405 Method Not Allowed returns JSON `{"error": "Method Not Allowed"}`.
    - Generic Python exceptions return HTTP 500 `{"error": "Internal server error"}`.
    - Custom error descriptions correctly populate the `error` response attribute.

## Verification

- `python -m unittest be/rag/error_handler_test.py`: 5/5 tests passed (0 failures, 0 errors).
- `python -m unittest discover -s be/rag -p "*_test.py"`: 92/92 tests passed.
