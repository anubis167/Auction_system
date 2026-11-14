# rag-1.6: Python tests in the verify gate

## Changed files

- `be/requirements.txt` (new): pinned Python dependencies of be/chat.py (flask, google-genai, python-dotenv, ngrok, requests, psycopg[binary]). Install: `python -m pip install -r be/requirements.txt`
- `package.json`: `test:py` = `python -m unittest discover -s be -p "*_test.py"`; `test` runs it last (after be vitest has reset and migrated auction_test, which the Python integration tests use). `verify` and `./init.sh` therefore run it too
- `.gitignore`: `__pycache__/` (the Python tests write it under be/ on every run)

## Notes

- 32 Python tests: chat_test 6, rag_db_test 1, rag_chunk_test 6, rag_embed_test 6, rag_docs_test 6, rag_chat_test 7. Gemini is always stubbed; integration tests need the docker compose db and skip with a message if it is down.
- A deliberately failing Python test made `npm run test:py` exit 1 (checked once, removed).
- `init.sh` itself still only runs `npm install`; the Python packages are a one-off `pip install -r be/requirements.txt` per machine.
- No Playwright spec added (SRS Req-2).
