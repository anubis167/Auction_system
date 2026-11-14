"""Round 12: RAG helpers for the chat box in chat.py (chunking, embeddings, retrieval)."""
import re
import time

from google.genai import errors

CHUNK_SIZE = 1000
CHUNK_OVERLAP = 150


def _pieces(text, limit):
    """Paragraphs; a paragraph over the limit falls back to sentences, a sentence over it to hard cuts."""
    for para in re.split(r"\n\s*\n", text):
        para = para.strip()
        if len(para) <= limit:
            if para:
                yield para
            continue
        for sentence in re.split(r"(?<=[.!?])\s+", para):
            for i in range(0, len(sentence), limit):
                yield sentence[i:i + limit]


def chunk_text(text, size=CHUNK_SIZE, overlap=CHUNK_OVERLAP):
    """rag-1.2: chunks of at most `size` chars; each starts with the last `overlap` chars of the one before."""
    limit = size - overlap - 1  # room for the overlap and its newline
    bodies, current = [], ""
    for piece in _pieces(text, limit):
        if current and len(current) + 2 + len(piece) > limit:
            bodies.append(current)
            current = piece
        else:
            current = f"{current}\n\n{piece}" if current else piece
    if current:
        bodies.append(current)

    chunks = []
    for body in bodies:
        chunks.append(f"{chunks[-1][-overlap:]}\n{body}" if chunks else body)
    return chunks


EMBED_MODEL = "gemini-embedding-001"
EMBED_BATCH = 100
EMBED_TRIES = 3
EMBED_DIMENSIONS = 768  # 4x smaller than the 3072 default; ranking uses cosine, so the vectors need no normalising


class EmbedError(Exception):
    """Embedding failed after every retry."""


def _retryable(error):
    # 4xx (bad request, bad key) will fail the same way again; 429, 5xx, timeouts and network errors may not
    return not isinstance(error, errors.APIError) or error.code == 429 or error.code >= 500


def embed(client, texts, task):
    """rag-1.3: one vector per text, in order. task: RETRIEVAL_DOCUMENT (indexing) or RETRIEVAL_QUERY (questions).
    Retries on top of the SDK's own retries in chat.py, which only cover a single HTTP call."""
    vectors = []
    for start in range(0, len(texts), EMBED_BATCH):
        batch = texts[start:start + EMBED_BATCH]
        for attempt in range(EMBED_TRIES):
            try:
                response = client.models.embed_content(model=EMBED_MODEL, contents=batch, config={"task_type": task, "output_dimensionality": EMBED_DIMENSIONS})
                break
            except Exception as e:
                if not _retryable(e) or attempt == EMBED_TRIES - 1:
                    raise EmbedError(f"Embedding failed: {e}") from e
                time.sleep(min(2 ** attempt, 4))
        vectors.extend(list(item.values) for item in response.embeddings)
    if len(vectors) != len(texts):
        raise EmbedError(f"Embedding returned {len(vectors)} vectors for {len(texts)} texts")
    return vectors
