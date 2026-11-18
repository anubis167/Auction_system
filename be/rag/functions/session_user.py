"""rag2-1.4: who the visitor is, decided by the Node API from their own session cookie (never from the request body)."""
from functions.call_api import ApiError, call_api

ROLES = ("customer", "staff", "admin")


def _valid(me):
    credit = me.get("credit")
    return (isinstance(me.get("id"), int) and me.get("role") in ROLES and isinstance(me.get("username"), str)
            and isinstance(credit, dict) and all(isinstance(credit.get(k), str) for k in ("balance", "held", "available"))
            and isinstance(me.get("bids"), list) and isinstance(me.get("lots"), list))


def session_user(cookie):
    """GET /api/rag/me with the visitor's cookie: {id, role, username, credit, bids, lots}, or None for a guest
    (no cookie, or Node answers 401). Any other failure raises ApiError."""
    if not cookie:
        return None
    try:
        me = call_api("GET", "/api/rag/me", cookie=cookie)
    except ApiError as e:
        if e.status == 401:
            return None
        raise
    if not _valid(me):
        raise ApiError("GET /api/rag/me: malformed user")
    return me
