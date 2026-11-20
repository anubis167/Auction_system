# rag-train-3 Record retrieved chunks and citations

Each saved turn keeps the knowledge chunks the retriever returned (rank, score) and whether the reply cited them.

| File | Change |
|---|---|
| be/src/routes/rag.ts | `GET /api/rag/chunks` rows now carry `id`. `POST /api/rag/turns` takes `retrievals: [{chunkId, rank, score, cited}]` (max 20) and saves them with the turn in one transaction; an unknown chunk id is 400 `Unknown chunk` and nothing is saved. |
| be/rag/functions/rank.py | Rows may carry extra fields after the embedding; they come back after the score/title/text. |
| be/rag/functions/retrieve.py | Checks and passes the chunk id: hits are `(score, title, text, chunk_id)`. |
| be/rag/functions/build_prompt.py, be/rag/chat.py | Unpack the 4-field hits. |
| be/rag/functions/cited_chunks.py | New: hits -> rag_retrievals rows; `cited` when the reply contains `[title]` (case-insensitive). |
| be/rag/prompts/excerpts.md | Asks the bot to cite an excerpt by its bracketed title, e.g. `[Fees]`. |
| e2e/py/rag_train_3_citations_test.py | New: matcher cases; chat sends ranked retrievals; refused/failed turns cite nothing. |
| e2e/integration/rag-train-3-retrievals.test.ts | New: ids in /chunks, two retrievals saved, still readable after the document's soft delete; bad/unknown chunk = 400, no turn. |
| e2e/rag-train-3-retrievals.spec.ts | New: e2e API check of one saved turn with two chunks against the running e2e API. |
| e2e/integration/rag2-1-1-rag-api.test.ts, e2e/py/rag2_1_4_chat_test.py, e2e/py/rag3_4_api_test.py | Chunk fixtures/expectations carry `id`. |

Known limit (code comment `shortcut:` in cited_chunks.py): all chunks of one document share its title, so they are all marked cited together.
Only `answered` turns can cite; refused and failed turns still list their retrievals with `cited=false`.
