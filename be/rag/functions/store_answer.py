"""faq-cache-7: keep a guest's Gemini answer for the same question next time, through PUT /api/rag/answer-cache."""
import logging

from functions.call_api import ApiError, call_api

log = logging.getLogger(__name__)


def store_answer(question, version, reply, sources):
    """True when Node cached it. Never raises: 409 (the knowledge changed meanwhile) and failures only skip caching."""
    try:
        call_api("PUT", "/api/rag/answer-cache", internal=True, expect=None,
                 json={"question": question, "version": version, "reply": reply, "sources": list(sources)})
    except ApiError as e:
        if e.status != 409:
            log.warning("Caching the answer failed: %s", e)
        return False
    return True
