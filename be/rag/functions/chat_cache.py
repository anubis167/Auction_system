"""Redis cache for the chat box's Gemini replies. The key covers everything that shapes the answer (model, the full system
instruction with the visitor's account and excerpts, and the conversation), so a hit is always the same question for the
same visitor. Without REDIS_URL, or when Redis fails, the chat simply calls Gemini as before."""
import hashlib
import json
import logging
import os

import redis

TTL_SECONDS = int(os.getenv("CHAT_CACHE_TTL_SECONDS", "3600"))
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
    generate() is called only on a miss and returns the reply text or None. The key is a sha256 of the request, so the
    visitor's account and the conversation are never stored in the clear."""
    store = _redis()
    key = None
    if store is not None:
        payload = json.dumps({"model": model, "system": system_instruction, "contents": contents}, sort_keys=True)
        key = "chat:reply:" + hashlib.sha256(payload.encode("utf-8")).hexdigest()
        try:
            cached = store.get(key)
            if cached:
                return cached.decode("utf-8")
        except redis.RedisError:
            log.exception("Chat cache read failed, calling Gemini")
    reply = generate()
    if reply and key:
        try:
            store.set(key, reply, ex=TTL_SECONDS)
        except redis.RedisError:
            log.exception("Chat cache write failed")
    return reply
