# rag-1.5: chat answers grounded in uploaded documents

## Flow of POST /api/chat (be/chat.py)

1. Same checks as chat-1.2 (shape, MAX_TURNS, MAX_TEXT, rate limit).
2. The last user message is embedded (`RETRIEVAL_QUERY`, `rag.embed`, with retries).
3. `rag.retrieve` scores every chunk of non-deleted documents by cosine similarity and keeps the best 4 at or above 0.6.
4. `rag.context_block` appends them to `WEB_PROMPT`, labelled `[document title]`, telling the bot not to state facts the excerpts or prompt do not give.
5. Response: `{reply}` as before; `{reply, sources: [titles]}` when excerpts were used. ChatBox.tsx reads only `reply`.

If step 2 or 3 fails (Gemini down after retries, db unreachable) the failure is logged and the bot answers without excerpts.

## Threshold

MIN_SCORE 0.6 comes from a live check (2026-11-14, gemini-embedding-001 at 768 dims): matching questions scored 0.68-0.77 against their document, small talk and off-topic questions 0.47-0.57.

## Changed files

- `be/rag.py`: `TOP_K`, `MIN_SCORE`, `cosine`, `rank`, `retrieve`, `context_block`
- `be/chat.py`: retrieval step and `sources` in `web_chat`; `isinstance(message,  )` restored to `isinstance(message, dict)` (the uncommitted edit made every /api/chat call raise TypeError)
- `be/rag_chat_test.py` (new): 3 unit tests (cosine, rank, context block) and 4 integration tests on auction_test with Gemini stubbed

## Notes

- `retrieve` scores all chunks in Python on every question (marked `shortcut:`); pgvector is the upgrade past a few thousand chunks.
- Live check: a 7% commission document uploaded through /api/docs; "How much commission do you take when my lot sells?" -> "Beat'em keeps a commission of 7% of the hammer price on every sold lot.", sources ['fees'].
