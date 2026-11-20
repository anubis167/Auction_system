"""rag2-1.4: screen Gemini's reply before it reaches the visitor."""
from functions.guard_reason import guard_reason

FALLBACK = "Sorry, I can't help with that. Please ask another question."


def guard_reply(reply):
    """The reply, or FALLBACK when it copies the prompt or contains a secret."""
    return FALLBACK if guard_reason(reply) else reply
