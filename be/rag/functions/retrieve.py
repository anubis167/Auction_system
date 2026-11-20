"""rag2-1.4: the document excerpts that best answer a question, read through the API."""
from functions.call_api import ApiError, call_api
from functions.embed import embed
from functions.rank import rank


def _is_vector(value):
    return isinstance(value, list) and all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in value)


def retrieve(client, question):
    """(score, title, text, chunk_id) hits for the question. Raises ApiError or EmbedError; the caller answers without them.
    shortcut: Node sends every live chunk and Python scores them all; move ranking to pgvector past a few thousand chunks."""
    vector = embed(client, [question], "RETRIEVAL_QUERY")[0]
    rows = call_api("GET", "/api/rag/chunks", internal=True, expect=list)
    checked = []
    for row in rows:
        if not (isinstance(row, dict) and isinstance(row.get("title"), str) and isinstance(row.get("text"), str)
                and _is_vector(row.get("embedding")) and isinstance(row.get("id"), int) and not isinstance(row["id"], bool)):
            raise ApiError("GET /api/rag/chunks: malformed chunk")
        checked.append((row["title"], row["text"], row["embedding"], row["id"]))
    return rank(checked, vector)
