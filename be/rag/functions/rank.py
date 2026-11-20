"""rag-1.5 / rag2-1.2: rank chunks against a question by cosine similarity."""
import math

# MIN_SCORE from a live check (2026-11-14, gemini-embedding-001 at 768 dims):
# matching questions scored 0.68-0.77, small talk and off-topic questions 0.47-0.57.
TOP_K = 4
MIN_SCORE = 0.6


def _cosine(a, b):
    norm = math.sqrt(sum(x * x for x in a) * sum(y * y for y in b))
    return sum(x * y for x, y in zip(a, b)) / norm if norm else 0.0


def rank(rows, query_vector, k=TOP_K, min_score=MIN_SCORE):
    """rows: (title, text, embedding, *extra). The k best at or above min_score, best first, as
    (score, title, text, *extra); retrieve passes the chunk id as extra (rag-train-3)."""
    scored = [(_cosine(query_vector, embedding), title, text, *extra) for title, text, embedding, *extra in rows if embedding]
    return sorted((hit for hit in scored if hit[0] >= min_score), key=lambda hit: hit[0], reverse=True)[:k]
