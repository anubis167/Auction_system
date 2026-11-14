# rag-1.2: chunk document text

## Changed files

- `be/rag.py` (new): `chunk_text(text, size=1000, overlap=150)`. Splits on blank lines (paragraphs); a paragraph over the limit splits on sentence ends, a sentence over it is cut by length. Pieces are packed up to 849 chars, then each chunk after the first starts with the last 150 chars of the previous chunk plus a newline, so no chunk passes 1000 chars.
- `be/rag_chunk_test.py` (new): 6 unit tests: short text, blank input, paragraph boundaries kept, long paragraph split on sentences, unbroken text hard-cut, overlap; every test also checks that removing the overlap gives back all non-whitespace content in order.
