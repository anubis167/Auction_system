"""rag-1.3 / rag2-1.2: Gemini embeddings with retries."""
import time

from google.genai import errors

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
    """One vector per text, in order. task: RETRIEVAL_DOCUMENT (indexing) or RETRIEVAL_QUERY (questions).
    Retries on top of the SDK's own retries in chat.py, which only cover a single HTTP call."""
    if client is None:
        raise EmbedError("GEMINI_API_KEY is not set")
    vectors = []
    for start in range(0, len(texts), EMBED_BATCH):
        batch = texts[start:start + EMBED_BATCH]
        for attempt in range(EMBED_TRIES):
            try:
                response = client.models.embed_content(
                    model=EMBED_MODEL, contents=batch,
                    config={"task_type": task, "output_dimensionality": EMBED_DIMENSIONS})
                break
            except Exception as e:
                if not _retryable(e) or attempt == EMBED_TRIES - 1:
                    raise EmbedError(f"Embedding failed: {e}") from e
                time.sleep(min(2 ** attempt, 4))
        vectors.extend(list(item.values) for item in response.embeddings)
    if len(vectors) != len(texts):
        raise EmbedError(f"Embedding returned {len(vectors)} vectors for {len(texts)} texts")
    return vectors
