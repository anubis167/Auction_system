"""rag-train-2: save one chat turn for later training, through POST /api/rag/turns."""
import hashlib
import logging

from functions.call_api import ApiError, call_api
from functions.load_prompt import load_prompt

log = logging.getLogger(__name__)


def log_turn(cookie, visitor, turn, consent=True):
    """Send the turn (userText, botText, outcome, guardTriggered, model, ...) with the system prompt's hash as its
    version. Returns the saved turn id, or None when nothing was saved: no visitor token, the visitor opted out
    (rag-train-5: then only {visitor, logging: false} is sent, never the text), or the API failed.
    Never raises: a lost log line must not cost the visitor their answer."""
    if not isinstance(visitor, str) or not visitor:
        return None
    if consent:
        body = {"visitor": visitor, "promptVersion": hashlib.sha256(load_prompt("system").encode()).hexdigest(), **turn}
    else:
        body = {"visitor": visitor, "logging": False}
    try:
        saved = call_api("POST", "/api/rag/turns", cookie=cookie, internal=True, json=body)
    except ApiError:
        log.exception("Saving the chat turn failed")
        return None
    turn_id = saved.get("turnId")
    return turn_id if isinstance(turn_id, int) and not isinstance(turn_id, bool) else None
