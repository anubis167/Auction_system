# rag-3.2: Security middleware blocking prompt ejection and injection attacks

SRS Req-2: Sercurity by block prompt ejection - middleware.

## Changes

- `be/rag/security.py`:
  - Implemented prompt injection / ejection detection engine and Flask middleware:
    - `check_prompt_injection(text)`: Scans strings against regex patterns matching prompt injection vectors:
      - Instruction overrides (e.g. "ignore previous instructions", "disregard all prior rules", "bypass constraints").
      - System prompt / architecture exfiltration (e.g. "output system prompt", "show initial prompt", "reveal your instructions").
      - Roleplay jailbreak personas (e.g. DAN mode, developer mode, uncensored mode, jailbreak triggers).
      - Delimiter and evasion exploits (e.g. fake XML/markdown instruction boundaries like `</instruction>`, `[SYSTEM]`, `Assistant:` injection).
    - `register_security_middleware(app)`: Injects a `before_request` hook that recursively inspects JSON bodies and query string arguments before reaching route handlers.
    - Rejects detected attacks immediately with HTTP 400 `{"error": "Prompt injection detected"}`.
    - Permits safe auction queries (e.g. asking about item bidding rules, auction schedules, registration requirements) without interference.

- `be/rag/chat.py`:
  - Registered `register_security_middleware(app)` in application initialization.

- `be/rag/security_test.py`:
  - Created 28 comprehensive unit tests covering:
    - Instruction override detections.
    - System prompt leak / extraction detections.
    - Jailbreak persona overrides.
    - Delimiter and markdown tag injection attempts.
    - Nested request payload scanning.
    - Query parameter inspection.
    - Pass-through verification for benign auction and user queries.

## Verification

- `python -m unittest be/rag/security_test.py`: 28/28 tests passed (0 failures, 0 errors).
- `python -m unittest discover -s be/rag -p "*_test.py"`: 92/92 tests passed.
