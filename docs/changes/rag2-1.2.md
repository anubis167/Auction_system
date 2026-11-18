# rag2-1.2: one function per file, and an API client that checks every answer

SRS Req-1, Req-2, Req-3. `be/rag/rag.py` (one 220-line module that also read Postgres with psycopg and checked
JWTs itself) is gone. Each RAG step is now one file in `be/rag/functions/`, named after its one public function:

| File | Job |
|---|---|
| `call_api.py` | The only way to data: one request to the Node API. Only `/api/rag/*` paths; forwards the visitor's cookie or adds `X-Internal-Token` only when asked; 10 s timeout; redirects never followed; non-2xx, non-JSON or a body of the wrong type raise `ApiError(status, message)` |
| `chunk_text.py`, `embed.py`, `rank.py` | Moved from rag.py unchanged (1000/150 chunks, 768-dim Gemini embeddings with retries, cosine top 4 at >= 0.6) |
| `retrieve.py`, `session_user.py` | rag2-1.4 |
| `check_messages.py`, `over_limit.py`, `handoff_or_error.py` | Moved out of chat.py unchanged |
| `read_upload.py` | rag2-1.5 |
| `load_prompt.py`, `build_prompt.py` | rag2-1.3 |
| `guard_reply.py` | rag2-1.4 |

- No framework (Req-3): Flask, google-genai and requests, as before. `psycopg` removed from `be/rag/requirements.txt`.
- `package.json` `test:py` now discovers only `e2e/py` (be/rag has no tests left; Python 3.12+ fails an empty discover)
  and sets a dummy `RAG_INTERNAL_TOKEN`.

## Tests
- `e2e/py/rag2_1_2_api_test.py`: `call_api` against a stub HTTP server on 127.0.0.1 (cookie/token only when asked,
  token missing, non-RAG paths refused, error status + message kept, redirect not followed, wrong JSON type, 204,
  API unreachable); cosine and rank; Req-2 layout check (each file has exactly one public function named after it);
  no `psycopg` anywhere in be/rag.
- `e2e/py/rag2_1_2_chunk_test.py`, `rag2_1_2_embed_test.py`: be/rag/rag_chunk_test.py and rag_embed_test.py moved
  with `git mv`, imports pointed at `functions/`. Cases unchanged.
