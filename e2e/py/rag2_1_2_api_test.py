"""rag2-1.2: call_api against a local stub HTTP server, and ranking. No network beyond 127.0.0.1. Run: npm run test:py"""
import json
import os
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "be", "rag"))
from functions.call_api import ApiError, call_api  # noqa: E402
from functions.rank import _cosine, rank  # noqa: E402


class Stub(BaseHTTPRequestHandler):
    """Answers with Stub.answer (status, body bytes, extra headers) and records each request in Stub.seen."""
    answer = (200, b"{}", {})
    seen = []

    def _reply(self):
        length = int(self.headers.get("Content-Length") or 0)
        Stub.seen.append({"method": self.command, "path": self.path, "headers": dict(self.headers),
                          "body": self.rfile.read(length) if length else b""})
        status, body, headers = Stub.answer
        self.send_response(status)
        for k, v in headers.items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    do_GET = do_POST = do_DELETE = _reply

    def log_message(self, *args):
        pass


class CallApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(("127.0.0.1", 0), Stub)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        Stub.seen = []
        env = {"RAG_API_URL": f"http://127.0.0.1:{self.server.server_port}/", "RAG_INTERNAL_TOKEN": "secret-token"}
        patch.dict(os.environ, env).start()
        self.addCleanup(patch.stopall)

    def answer(self, status, body, headers=None):
        Stub.answer = (status, body if isinstance(body, bytes) else json.dumps(body).encode(), headers or {})

    def test_cookie_and_token_only_when_asked(self):
        self.answer(200, {"ok": True})
        self.assertEqual(call_api("GET", "/api/rag/me"), {"ok": True})
        self.assertNotIn("Cookie", Stub.seen[-1]["headers"])
        self.assertNotIn("X-Internal-Token", Stub.seen[-1]["headers"])

        call_api("GET", "/api/rag/me", cookie="abc")
        self.assertEqual(Stub.seen[-1]["headers"]["Cookie"], "auction_token=abc")
        self.assertNotIn("X-Internal-Token", Stub.seen[-1]["headers"])

        self.answer(200, [])
        self.assertEqual(call_api("GET", "/api/rag/chunks", internal=True, expect=list), [])
        self.assertEqual(Stub.seen[-1]["headers"]["X-Internal-Token"], "secret-token")
        self.assertEqual(Stub.seen[-1]["path"], "/api/rag/chunks")

    def test_json_body_is_sent(self):
        self.answer(201, {"id": 1})
        call_api("POST", "/api/rag/documents", internal=True, json={"title": "Fees"})
        self.assertEqual(json.loads(Stub.seen[-1]["body"]), {"title": "Fees"})

    def test_missing_token_is_refused_before_any_call(self):
        os.environ["RAG_INTERNAL_TOKEN"] = ""
        with self.assertRaises(ApiError):
            call_api("GET", "/api/rag/chunks", internal=True, expect=list)
        self.assertEqual(Stub.seen, [])

    def test_only_rag_routes(self):
        for path in ("/api/admin/users", "/api/ragged", "http://evil/api/rag/me", "/api/rag"):
            with self.assertRaises(ApiError, msg=path):
                call_api("GET", path)
        self.assertEqual(Stub.seen, [])

    def test_errors_keep_status_and_message(self):
        self.answer(403, {"error": "You do not have permission to do this"})
        with self.assertRaises(ApiError) as e:
            call_api("GET", "/api/rag/documents", cookie="abc")
        self.assertEqual((e.exception.status, e.exception.message), (403, "You do not have permission to do this"))

        self.answer(500, b"<html>oops</html>")
        with self.assertRaises(ApiError) as e:
            call_api("GET", "/api/rag/me")
        self.assertEqual((e.exception.status, e.exception.message), (500, None))

    def test_redirect_is_not_followed(self):
        self.answer(302, b"", {"Location": "/api/rag/me"})
        with self.assertRaises(ApiError) as e:
            call_api("GET", "/api/rag/documents")
        self.assertEqual(e.exception.status, 302)
        self.assertEqual(len(Stub.seen), 1)

    def test_answer_must_be_json_of_the_expected_type(self):
        self.answer(200, b"not json")
        with self.assertRaises(ApiError):
            call_api("GET", "/api/rag/me")
        self.answer(200, [1, 2])
        with self.assertRaises(ApiError):
            call_api("GET", "/api/rag/me")  # expects a dict
        self.answer(200, {"a": 1})
        with self.assertRaises(ApiError):
            call_api("GET", "/api/rag/chunks", expect=list)
        self.answer(200, b"")
        with self.assertRaises(ApiError):
            call_api("GET", "/api/rag/me")  # empty body is not a dict

    def test_204_with_expect_none(self):
        self.answer(204, b"")
        self.assertIsNone(call_api("DELETE", "/api/rag/documents/1", cookie="abc", expect=None))

    def test_unreachable_api(self):
        os.environ["RAG_API_URL"] = "http://127.0.0.1:1"
        with self.assertRaises(ApiError) as e:
            call_api("GET", "/api/rag/me")
        self.assertIsNone(e.exception.status)


class Ranking(unittest.TestCase):
    def test_cosine(self):
        self.assertAlmostEqual(_cosine([1, 0], [2, 0]), 1.0)
        self.assertAlmostEqual(_cosine([1, 0], [0, 3]), 0.0)
        self.assertEqual(_cosine([0, 0], [1, 0]), 0.0)  # empty vector, no ZeroDivisionError

    def test_rank_keeps_the_best_above_the_threshold(self):
        rows = [("A", "a", [1, 0]), ("B", "b", [0.9, 0.1]), ("C", "c", [0, 1]), ("D", "d", []), ("E", "e", [0.7, 0.3])]
        hits = rank(rows, [1, 0], k=2, min_score=0.5)
        self.assertEqual([title for _, title, _ in hits], ["A", "B"])
        self.assertEqual(rank(rows, [1, 0], k=9, min_score=0.99)[0][1], "A")
        self.assertEqual(rank(rows, [-1, 0]), [])


class OneFunctionPerFile(unittest.TestCase):
    """Req-2: each file in functions/ defines exactly one public function, named after the file."""

    def test_layout(self):
        import ast
        folder = os.path.join(os.path.dirname(__file__), "..", "..", "be", "rag", "functions")
        for name in sorted(os.listdir(folder)):
            if not name.endswith(".py") or name == "__init__.py":
                continue
            with open(os.path.join(folder, name), encoding="utf-8") as f:
                tree = ast.parse(f.read())
            public = [n.name for n in tree.body if isinstance(n, ast.FunctionDef) and not n.name.startswith("_")]
            self.assertEqual(public, [name[:-3]], name)

    def test_no_direct_database_access(self):
        rag_dir = os.path.join(os.path.dirname(__file__), "..", "..", "be", "rag")
        for root, dirs, files in os.walk(rag_dir):
            dirs[:] = [d for d in dirs if d not in ("ecbot", "__pycache__", ".venv")]
            for name in files:
                if name.endswith(".py"):
                    with open(os.path.join(root, name), encoding="utf-8") as f:
                        self.assertNotIn("psycopg", f.read(), name)


if __name__ == "__main__":
    unittest.main()
