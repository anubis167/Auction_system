# rag-1.3: embeddings with retries

## Changed files

- `be/rag.py`: `embed(client, texts, task)` with `client` = the Gemini client from `be/chat.py` (Req-1). Model `gemini-embedding-001`, 768 dimensions (`output_dimensionality`; the 3072 default is 4x the storage for little gain). Batches of 100. Up to 3 tries per batch with 1 s / 2 s waits on 429, 5xx, timeouts and network errors; other 4xx fail at once. Raises `EmbedError` when it gives up or gets the wrong number of vectors.
- `be/rag_embed_test.py` (new): 6 unit tests with a stubbed client and `time.sleep` patched.

## Notes

- These retries sit on top of the SDK retries configured in `chat.py` (`retry_options.attempts = 4`), which cover one HTTP call. Worst case for a hard outage: 3 x 4 calls before `EmbedError`.
- Live check 2026-11-14 with the project key: 2 texts -> 2 vectors of 768.
