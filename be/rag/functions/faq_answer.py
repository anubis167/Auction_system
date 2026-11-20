"""faq-cache-6: the FAQ answer for a chat question, from Node's Redis-backed GET /api/rag/faq-match."""
import logging
from urllib.parse import quote

from functions.call_api import ApiError, call_api

log = logging.getLogger(__name__)


def faq_answer(question):
    """{faqId, question, answer} when the question is an FAQ (same question after normalizing), else None.
    Never raises: when Node or Redis fails the caller simply goes on with the RAG pipeline."""
    try:
        found = call_api("GET", f"/api/rag/faq-match?q={quote(question, safe='')}", internal=True)
    except ApiError as e:
        if e.status != 404:  # 404 is the normal "not an FAQ"
            log.warning("FAQ lookup failed, answering with RAG: %s", e)
        return None
    answer = found.get("answer")
    return found if isinstance(answer, str) and answer.strip() else None
