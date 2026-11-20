"""Redis cache for the chat box's Gemini replies. A dynamic question is keyed on everything that shapes the answer (model,
the full system instruction with the visitor's account and excerpts, and the conversation) and kept for an hour. An FAQ
question (single message, on faq_questions.json) is keyed on the question alone and kept forever, so it is answered
the same for everyone. Without REDIS_URL, or when Redis fails, the chat simply calls Gemini as before."""
import hashlib
import json
import logging
import os

import redis

from functions.faq_question import faq_question
from functions.load_prompt import load_prompt

TTL_SECONDS = int(os.getenv("CHAT_CACHE_TTL_SECONDS", "3600"))  # dynamic questions only; FAQ replies never expire
log = logging.getLogger(__name__)
_store = None  # redis.Redis, created on first use


def _redis():
    global _store
    url = os.getenv("REDIS_URL")
    if not url:
        return None
    if _store is None:
        _store = redis.Redis.from_url(url, socket_timeout=2, socket_connect_timeout=2)
    return _store


def chat_cache(model, system_instruction, contents, generate):
    """The reply for this request: the cached one, or generate()'s answer, which is cached when it is non-empty.
    generate() is called only on a miss and returns the reply text or None. The key is a sha256, so the visitor's
    account and the conversation are never stored in the clear. FAQ replies ignore the account and excerpts."""
    store = _redis()
    key = None
    faq = faq_question(contents[-1]["parts"][0]["text"]) if len(contents) == 1 else None
    if faq:
        payload = {"model": model, "faq": faq, "system": load_prompt("system")}
        ttl = None  # redis-py: ex=None keeps the key forever
    else:
        payload = {"model": model, "system": system_instruction, "contents": contents}
        ttl = TTL_SECONDS
    if store is not None:
        key = "chat:reply:" + hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()
        try:
            cached = store.get(key)
            if cached:
                return cached.decode("utf-8")
        except redis.RedisError:
            log.exception("Chat cache read failed, calling Gemini")
    reply = generate()
    if reply and key:
        try:
            store.set(key, reply, ex=ttl)
        except redis.RedisError:
            log.exception("Chat cache write failed")
    return reply
