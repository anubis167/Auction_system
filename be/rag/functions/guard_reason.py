"""rag-train-2: which reply guard fires on a Gemini reply (ecbot: prompt_leak.py, guardrails/secrets.py)."""
import os
import re

# The section tags of prompts/*.md: a reply has no reason to contain them unless it is copying the prompt
_PROMPT_MARKERS = ("<role>", "<rules>", "<security>", "<format>", "<account>", "<excerpts>", "<untrusted")
_SECRETS = (
    re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+"),  # JWT, e.g. a session cookie
    re.compile(r"\bAIza[0-9A-Za-z_-]{30,}"),  # Google API key
    re.compile(r"\b(sk|pk|rk)[-_][A-Za-z0-9]{16,}"),
    re.compile(r"\bBearer\s+[A-Za-z0-9._-]{20,}", re.IGNORECASE),
)


def guard_reason(reply):
    """"prompt_leak" when the reply copies the prompt, "secrets" when it holds a secret, else None."""
    if any(marker in reply.lower() for marker in _PROMPT_MARKERS):
        return "prompt_leak"
    token = os.getenv("RAG_INTERNAL_TOKEN")
    if any(p.search(reply) for p in _SECRETS) or (token and len(token) >= 8 and token in reply):
        return "secrets"
    return None
