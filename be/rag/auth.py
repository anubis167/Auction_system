"""Authentication and authorization module for RAG API endpoints.

Authenticates via cookie `auction_token` OR `Authorization: Bearer <jwt>`
using `rag.read_token` and `rag.session_user`.
Enforces authentication (401 if missing/invalid/expired/blocked) and
authorization based on user role (customer, staff, admin).
"""

from __future__ import annotations

import functools
import hashlib
import hmac
import json
import os
import time
from typing import Any, Iterable, Optional, Tuple
from flask import jsonify, request, g
import rag

ALLOWED_CHAT_ROLES = ("customer", "staff", "admin")
ALLOWED_DOCS_ROLES = ("staff", "admin")
ALLOWED_RETRIEVE_ROLES = ("customer", "staff", "admin")


def read_claims(token: str) -> Optional[dict]:
    """Decodes and verifies HS256 JWT claims without database lookup."""
    try:
        header, payload, signature = token.split(".")
        if json.loads(rag._b64(header)).get("alg") != "HS256":
            return None
        secret = os.getenv("JWT_SECRET", "dev-secret").encode()
        expected = hmac.new(secret, f"{header}.{payload}".encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(expected, rag._b64(signature)):
            return None
        claims = json.loads(rag._b64(payload))
        if not isinstance(claims.get("exp"), (int, float)) or claims["exp"] <= time.time():
            return None
        return claims
    except Exception:
        return None


def extract_token(req: Any = None) -> Optional[str]:
    """Extracts JWT token from cookie `auction_token` or `Authorization: Bearer <jwt>`."""
    if req is None:
        req = request

    cookie_token = req.cookies.get(rag.COOKIE)
    if cookie_token and cookie_token.strip():
        return cookie_token.strip()

    auth_header = req.headers.get("Authorization")
    if auth_header:
        auth_header = auth_header.strip()
        if auth_header.startswith("Bearer "):
            bearer_token = auth_header[7:].strip()
            if bearer_token:
                return bearer_token

    return None


def authenticate_user(conn: Any, req: Any = None) -> Tuple[Optional[dict], Optional[Tuple[Any, int]]]:
    """Authenticates the incoming request against database users.

    Returns:
        (user_dict, None) if authenticated.
        (None, (jsonify(error="Authentication required"), 401)) if unauthenticated.
    """
    token = extract_token(req)
    if not token:
        return None, (jsonify(error="Authentication required"), 401)

    user = rag.session_user(conn, token)
    if not user:
        return None, (jsonify(error="Authentication required"), 401)

    return user, None


def check_permission(
    conn: Any, allowed_roles: Optional[Iterable[str]] = None, req: Any = None
) -> Tuple[Optional[dict], Optional[Tuple[Any, int]]]:
    """Authenticates and verifies role authorization.

    Returns:
        (user_dict, None) if authorized.
        (None, (jsonify(error="Authentication required"), 401)) if unauthenticated.
        (None, (jsonify(error="Forbidden"), 403)) if role unauthorized.
    """
    user, denied = authenticate_user(conn, req)
    if denied:
        return None, denied

    if allowed_roles is not None and user["role"] not in allowed_roles:
        return None, (jsonify(error="Forbidden"), 403)

    return user, None


def require_auth(allowed_roles: Optional[Iterable[str]] = None):
    """Decorator to enforce authentication and authorization on Flask routes."""
    def decorator(f):
        @functools.wraps(f)
        def wrapper(*args, **kwargs):
            with rag.connect() as conn:
                user, denied = check_permission(conn, allowed_roles)
                if denied:
                    return denied
                g.current_user = user
            return f(*args, **kwargs)

        return wrapper

    return decorator
