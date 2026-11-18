"""rag2-1.4: screen Gemini's reply before it reaches the visitor (ecbot: prompt_leak.py, guardrails/secrets.py)."""
import os
import re

FALLBACK = "Sorry, I can't help with that. Please ask another question."

# The section tags of prompts/*.md: a reply has no reason to contain them unless it is copying the prompt
_PROMPT_MARKERS = ("<role>", "<rules>", "<security>", "<format>", "<account>", "<excerpts>", "<untrusted")
_SECRETS = (
    re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+"),  # JWT, e.g. a session cookie
    re.compile(r"\bAIza[0-9A-Za-z_-]{30,}"),  # Google API key
    re.compile(r"\b(sk|pk|rk)[-_][A-Za-z0-9]{16,}"),
    re.compile(r"\bBearer\s+[A-Za-z0-9._-]{20,}", re.IGNORECASE),
)


def guard_reply(reply):
    """The reply, or FALLBACK when it copies the prompt or contains a secret."""
    lowered = reply.lower()
    token = os.getenv("RAG_INTERNAL_TOKEN")
    if (any(marker in lowered for marker in _PROMPT_MARKERS) or any(p.search(reply) for p in _SECRETS)
            or (token and len(token) >= 8 and token in reply)):
        return FALLBACK
    return reply
