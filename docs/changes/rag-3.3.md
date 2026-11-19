# rag-3.3: Authentication and authorization enforcement on all RAG and Chat routes

SRS Req-1: all routes have both authenticated and authorized.

## Changes

- `be/rag/auth.py`:
  - Implemented authentication and authorization helpers and decorator:
    - `extract_token(request)`: Extracts JWT access token from `auction_token` cookie or `Authorization: Bearer <jwt>` header.
    - `decode_token(raw_jwt)`: Decodes and cryptographically verifies HS256 signature using `JWT_SECRET`, checks expiration timestamp (`exp`), and validates payload structure (`sub`, `role`).
    - `authenticate_user(conn, request)`: Lookups user in PostgreSQL `users` table; confirms user exists and account status is `active`. Returns authenticated user context dictionary or raises `AuthError`.
    - `require_auth(allowed_roles=None)`: Route decorator enforcing:
      - HTTP 401 `{"error": "Authentication required"}` when token is missing, invalid, expired, or account locked.
      - HTTP 403 `{"error": "Forbidden"}` when user role lacks required permissions.
      - Injects authenticated user record into `flask.g.user` or route kwargs.

- `be/rag/chat.py`:
  - Applied `@require_auth(["customer", "staff", "admin"])` to `/api/chat` and `/api/rag/retrieve`.
  - Applied `@require_auth(["staff", "admin"])` to `/api/docs` (POST, GET) and `/api/docs/<int:doc_id>` (GET, DELETE).
  - Updated `/api/chat` handler to resolve user identity directly from authenticated token context (`g.user["id"]`), preventing spoofing.

- `be/rag/auth_test.py`:
  - Created 13 unit tests verifying:
    - Token extraction from both cookie and Bearer header.
    - HS256 signature verification and tamper rejection.
    - Expiration time enforcement.
    - Inactive / locked account rejection (401).
    - Missing token rejection (401).
    - Role authorization checks (403 when customer attempts staff/admin endpoints).
    - Proper passing for authorized roles.

- `be/rag/chat_test.py`:
  - Updated test client fixtures to provide valid test customer authentication token.
  - Added test case validating unauthenticated requests return HTTP 401.

- `be/rag/rag_user_test.py`:
  - Updated user context integration tests to align with authenticated user context requirements.

## Verification

- `python -m unittest be/rag/auth_test.py be/rag/chat_test.py be/rag/rag_user_test.py`: All tests passed.
- `python -m unittest discover -s be/rag -p "*_test.py"`: 92/92 tests passed (0 failures, 0 errors).
