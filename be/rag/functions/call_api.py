"""rag2-1.2: the only way the RAG service reads or writes data: a call to the Node API, with the answer checked."""
import os

import requests

COOKIE = "auction_token"  # the Node API's session cookie (be/src/config.ts cookieName)
TIMEOUT_SECONDS = 10


class ApiError(Exception):
    """The API could not be reached, refused the call, or answered something other than what was expected.
    status is the HTTP status (None when the API was never reached); message is the API's own error text, if any."""

    def __init__(self, detail, status=None, message=None):
        super().__init__(detail)
        self.status = status
        self.message = message


def call_api(method, path, cookie=None, internal=False, json=None, expect=dict):
    """One request to the Node API. cookie: the visitor's session, forwarded so Node decides who they are.
    internal: add the service token (routes only this service may use). expect: dict, list, or None for an empty
    204 answer. Returns the parsed body; anything else raises ApiError."""
    if not path.startswith("/api/rag/"):
        raise ApiError(f"{path} is not a RAG route")  # least privilege: this service only talks to /api/rag
    headers = {}
    if internal:
        token = os.getenv("RAG_INTERNAL_TOKEN")
        if not token:
            raise ApiError("RAG_INTERNAL_TOKEN is not set")
        headers["X-Internal-Token"] = token
    url = os.getenv("RAG_API_URL", "http://localhost:4000").rstrip("/") + path
    try:
        res = requests.request(method, url, headers=headers, cookies={COOKIE: cookie} if cookie else None,
                               json=json, timeout=TIMEOUT_SECONDS, allow_redirects=False)
    except requests.RequestException as e:
        raise ApiError(f"{method} {path}: {e}") from e

    try:
        body = res.json() if res.content else None
    except ValueError:
        body = None
        if 200 <= res.status_code < 300:
            raise ApiError(f"{method} {path}: answer is not JSON", res.status_code)
    if not 200 <= res.status_code < 300:  # a redirect counts as a refusal: it is never followed
        message = body.get("error") if isinstance(body, dict) and isinstance(body.get("error"), str) else None
        raise ApiError(f"{method} {path}: {res.status_code}", res.status_code, message)
    if expect is None:
        return body
    if not isinstance(body, expect):
        raise ApiError(f"{method} {path}: expected a JSON {expect.__name__}", res.status_code)
    return body
