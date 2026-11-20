"""faq-cache-7: a cached bot answer to a guest's question, from Node's GET /api/rag/answer-cache (Redis)."""
import logging
from urllib.parse import quote

from functions.call_api import ApiError, call_api

log = logging.getLogger(__name__)


def cached_answer(question):
    """{"version": str, "answer": {"reply", "sources"} or None}; None when the lookup failed. Never raises.
    version goes back to store_answer, so an answer built before the knowledge changed is not cached."""
    try:
        found = call_api("GET", f"/api/rag/answer-cache?q={quote(question, safe='')}", internal=True)
    except ApiError as e:
        log.warning("Answer cache lookup failed, answering with RAG: %s", e)
        return None
    version, answer = found.get("version"), found.get("answer")
    if not isinstance(version, str):
        return None
    if not (isinstance(answer, dict) and isinstance(answer.get("reply"), str) and answer["reply"]
            and isinstance(answer.get("sources"), list) and all(isinstance(s, str) for s in answer["sources"])):
        answer = None
    return {"version": version, "answer": answer}
