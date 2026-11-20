# faq-cache-6 - Chat answers FAQ questions from the cache; everything else still goes through RAG

SRS: system - caching FAQ with redis, Req-3 (keep the RAG pipeline).

## Changed files

| File | Change |
|---|---|
| be/rag/functions/faq_answer.py | New: `faq_answer(question)` calls `GET /api/rag/faq-match` (internal token, question URL-encoded as one value). Returns `{faqId, question, answer}` or None; never raises (404 = not an FAQ; any other failure is logged and also None). A blank answer counts as no match. |
| be/rag/chat.py | `web_chat`: after the prompt-injection middleware, `check_messages`, the visitor lookup and the rate limit, and before `retrieve`, an FAQ match is answered at once: reply = the FAQ answer, `sources: ["FAQ"]`, turn logged as `answered` with model `faq-cache` (`FAQ_MODEL`), `turnId` returned so thumbs feedback works. No embedding, no `/chunks`, no Gemini call. No match or a failed lookup: the RAG path runs exactly as before. `_save_turn` takes an optional `model`. |
| e2e/py/fake_api.py | Fake `GET /api/rag/faq-match` over `FakeApi.faqs`, with Node's normalization. |
| e2e/py/faq_cache_6_chat_test.py | New (8 tests): FAQ hit without Gemini or retrieval, turn logged with `faq-cache`; signed-in customer same answer, turn carries the user; non-FAQ question goes through RAG; lookup 502/500/connection error falls back to RAG; opted-out visitor gets the answer and no turn is saved; rate limit and prompt injection still come first; `faq_answer` URL-encoding, 400 and blank-answer cases. |
| e2e/py/rag2_1_6_full_path_test.py | Its RAG questions said "What is a reserve price?", which is now FAQ Q29 word for word and is answered from the FAQ; reworded to "Explain the reserve price rule" so they still test RAG. New test: Q29 through the real Node API (Postgres, then Redis) returns the FAQ answer twice without Gemini, and a non-FAQ question still reaches Gemini. Its Node server now uses Redis database 1 (tests), not 0 (dev). |

## Notes

- FAQ answers are staff-written, so `guard_reason` (which checks Gemini output) is not applied to them.
- Only the last message is matched; earlier conversation turns do not matter for an FAQ hit.
