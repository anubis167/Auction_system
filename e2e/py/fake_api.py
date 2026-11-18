"""rag2 test helper (not a test): a stand-in for the Node /api/rag routes, patched in at requests.request inside
functions/call_api.py, so call_api's own checks (status, JSON, type) still run on every answer."""
import json
import os
import sys
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "be", "rag"))
os.environ.setdefault("RAG_INTERNAL_TOKEN", "test-internal-token")

TOKEN = os.environ["RAG_INTERNAL_TOKEN"]


class Response:
    def __init__(self, status, body):
        self.status_code = status
        self.content = b"" if body is None else body if isinstance(body, bytes) else json.dumps(body).encode()

    def json(self):
        return json.loads(self.content)


def account(user_id=7, role="customer", username="ann", bids=(), lots=()):
    """An /api/rag/me answer."""
    return {"id": user_id, "role": role, "username": username,
            "credit": {"balance": "150.00", "held": "20.00", "available": "130.00"},
            "bids": list(bids), "lots": list(lots)}


class FakeApi:
    """sessions: cookie -> /api/rag/me answer. chunks: /api/rag/chunks answer. documents: stored uploads.
    Set fail[path_prefix] = (status, body) to make a route answer that instead. calls: every request seen."""

    def __init__(self):
        self.sessions = {}
        self.chunks = []
        self.documents = []
        self.fail = {}
        self.calls = []

    def start(self, test):
        p = patch("functions.call_api.requests.request", side_effect=self.request)
        p.start()
        test.addCleanup(p.stop)
        return self

    def user(self, cookie):
        return self.sessions.get(cookie)

    def request(self, method, url, headers=None, cookies=None, json=None, **_):
        path = "/" + url.split("/", 3)[3]
        cookie = (cookies or {}).get("auction_token")
        internal = (headers or {}).get("X-Internal-Token") == TOKEN
        self.calls.append({"method": method, "path": path, "cookie": cookie, "internal": internal, "json": json})
        for prefix, answer in self.fail.items():
            if path.startswith(prefix):
                if isinstance(answer, Exception):
                    raise answer
                return Response(*answer)

        if path == "/api/rag/me":
            me = self.user(cookie)
            return Response(200, me) if me else Response(401, {"error": "Authentication required"})
        if path == "/api/rag/chunks":
            return Response(200, self.chunks) if internal else Response(401, {"error": "Invalid internal token"})
        if path.startswith("/api/rag/documents"):
            me = self.user(cookie)
            if not me:
                return Response(401, {"error": "Authentication required"})
            if me["role"] not in ("staff", "admin"):
                return Response(403, {"error": "You do not have permission to do this"})
            if method == "POST":
                if not internal:
                    return Response(401, {"error": "Invalid internal token"})
                doc = dict(json, id=len(self.documents) + 1, deleted=False)
                self.documents.append(doc)
                return Response(201, {"id": doc["id"], "title": doc["title"], "chunks": len(doc["chunks"])})
            live = [d for d in self.documents if not d["deleted"]]
            if method == "GET" and path != "/api/rag/documents":
                doc_id = int(path.rsplit("/", 1)[1])
                for d in live:
                    if d["id"] == doc_id:
                        return Response(200, {"id": d["id"], "title": d["title"], "filename": d["filename"],
                                              "chunks": [{"id": i + 1, "position": i, "text": c["text"]}
                                                         for i, c in enumerate(d["chunks"])]})
                return Response(404, {"error": "Document not found"})
            if method == "GET":
                return Response(200, {"documents": [{"id": d["id"], "title": d["title"], "filename": d["filename"],
                                                     "chunks": len(d["chunks"])} for d in reversed(live)]})
            doc_id = int(path.rsplit("/", 1)[1])
            for d in live:
                if d["id"] == doc_id:
                    d["deleted"] = True
                    return Response(204, None)
            return Response(404, {"error": "Document not found"})
        return Response(404, {"error": "Not found"})
