"""rag-1.4 integration: /api/docs on the real Postgres (auction_test), Gemini stubbed. Run: python be/rag_docs_test.py"""
import base64
import hashlib
import hmac
import io
import json
import os
import time
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import psycopg

os.environ["DATABASE_URL"] = os.getenv("RAG_TEST_DATABASE_URL", "postgresql://auction:auction@localhost:5436/auction_test")
import chat  # noqa: E402  (after DATABASE_URL: load_dotenv does not override it)
import rag  # noqa: E402

PREFIX = "ragdocs_"


def b64(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def token(user_id, exp_in=600, secret=None, alg="HS256"):
    """An access token shaped like the Node API's jwt.sign output."""
    secret = (secret or os.getenv("JWT_SECRET", "dev-secret")).encode()
    head = b64(json.dumps({"alg": alg, "typ": "JWT"}).encode())
    body = b64(json.dumps({"sub": str(user_id), "role": "staff", "exp": int(time.time()) + exp_in}).encode())
    sig = b64(hmac.new(secret, f"{head}.{body}".encode(), hashlib.sha256).digest())
    return f"{head}.{body}.{sig}"


def fake_embed(model, contents, config):
    return SimpleNamespace(embeddings=[SimpleNamespace(values=[1.0, float(i)]) for i, _ in enumerate(contents)])


class DocsApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            cls.db = psycopg.connect(os.environ["DATABASE_URL"], connect_timeout=3, autocommit=True)
        except psycopg.OperationalError as e:
            raise unittest.SkipTest(f"Postgres not reachable: {e}")
        cls.cleanup()
        cls.users = {}
        for name, role, status in [("staff", "staff", "active"), ("admin", "admin", "active"),
                                   ("cust", "customer", "active"), ("locked", "staff", "locked")]:
            cls.users[name] = cls.db.execute(
                "INSERT INTO users (email, username, password_hash, role, status, updated_at) "
                "VALUES (%s, %s, 'x', %s, %s, now()) RETURNING id",
                (f"{PREFIX}{name}@test.local", f"{PREFIX}{name}", role, status),
            ).fetchone()[0]

    @classmethod
    def cleanup(cls):
        users = "SELECT id FROM users WHERE username LIKE 'ragdocs\\_%'"
        docs = f"SELECT id FROM knowledge_documents WHERE uploaded_by_id IN ({users})"
        cls.db.execute(f"DELETE FROM knowledge_chunks WHERE document_id IN ({docs})")  # test data only
        cls.db.execute(f"DELETE FROM knowledge_documents WHERE uploaded_by_id IN ({users})")
        cls.db.execute(f"DELETE FROM users WHERE id IN ({users})")

    @classmethod
    def tearDownClass(cls):
        cls.cleanup()
        cls.db.close()

    def setUp(self):
        self.client = patch.object(chat, "client", MagicMock()).start()
        self.addCleanup(patch.stopall)
        self.client.models.embed_content.side_effect = fake_embed
        self.http = chat.app.test_client()
        self.login("staff")

    def login(self, who):
        self.http.set_cookie(rag.COOKIE, token(self.users[who]) if who else "")

    def upload(self, data=b"Fees are 5%.\n\nPay by card.", filename="fees.md", title=None):
        form = {"file": (io.BytesIO(data), filename)}
        if title is not None:
            form["title"] = title
        return self.http.post("/api/docs", data=form, content_type="multipart/form-data")

    def stored(self, doc_id):
        return self.db.execute(
            "SELECT title, filename, mime_type, deleted_at IS NOT NULL, (SELECT count(*) FROM knowledge_chunks WHERE document_id = d.id) "
            "FROM knowledge_documents d WHERE id = %s", (doc_id,)).fetchone()

    def test_upload_stores_document_chunks_and_vectors(self):
        res = self.upload((("Paragraph. " * 60) + "\n\n").encode() * 4, "guide.md", " Seller guide ")
        self.assertEqual(res.status_code, 201, res.json)
        doc_id = res.json["id"]
        self.assertEqual(res.json["title"], "Seller guide")
        self.assertGreater(res.json["chunks"], 1)
        self.assertEqual(self.stored(doc_id), ("Seller guide", "guide.md", "text/markdown", False, res.json["chunks"]))
        rows = self.db.execute("SELECT position, embedding FROM knowledge_chunks WHERE document_id = %s ORDER BY position",
                               (doc_id,)).fetchall()
        self.assertEqual(rows, [(i, [1.0, float(i)]) for i in range(len(rows))])
        self.assertEqual(self.client.models.embed_content.call_args.kwargs["config"]["task_type"], "RETRIEVAL_DOCUMENT")

    def test_title_defaults_to_file_name_and_admin_may_upload(self):
        self.login("admin")
        res = self.upload(filename="notes.txt")
        self.assertEqual((res.status_code, res.json["title"]), (201, "notes"))
        self.assertEqual(self.stored(res.json["id"])[2], "text/plain")

    def test_auth(self):
        for who, status in [(None, 401), ("cust", 403), ("locked", 401)]:
            self.login(who)
            self.assertEqual(self.upload().status_code, status, who)
            self.assertEqual(self.http.get("/api/docs").status_code, status, who)
            self.assertEqual(self.http.delete("/api/docs/1").status_code, status, who)
        staff = self.users["staff"]
        for bad in (token(staff, secret="wrong"), token(staff, exp_in=-5), token(staff, alg="none"), "garbage", "a.b.c"):
            self.http.set_cookie(rag.COOKIE, bad)
            self.assertEqual(self.upload().status_code, 401, bad)
        self.client.models.embed_content.assert_not_called()

    def test_bad_files_store_nothing(self):
        before = self.db.execute("SELECT count(*) FROM knowledge_documents").fetchone()[0]
        cases = [(b"x", "a.pdf", 400), (b"x", "noext", 400), (b"\xff\xfe\x00bad", "a.txt", 400), (b"  \n\n ", "a.md", 400),
                 (b"x" * (chat.DOC_MAX_BYTES + 1), "big.txt", 413), (b"x" * (chat.DOC_MAX_BYTES + 100_000), "huge.txt", 413)]
        for data, name, status in cases:
            self.assertEqual(self.upload(data, name).status_code, status, name)
        self.assertEqual(self.http.post("/api/docs", data={}, content_type="multipart/form-data").status_code, 400)
        self.assertEqual(self.db.execute("SELECT count(*) FROM knowledge_documents").fetchone()[0], before)
        self.client.models.embed_content.assert_not_called()

    @patch("rag.time.sleep")
    def test_embedding_failure_leaves_nothing(self, _sleep):
        before = self.db.execute("SELECT count(*) FROM knowledge_documents").fetchone()[0]
        self.client.models.embed_content.side_effect = TimeoutError("down")
        self.assertEqual(self.upload().status_code, 503)
        self.assertEqual(self.db.execute("SELECT count(*) FROM knowledge_documents").fetchone()[0], before)

    def test_list_newest_first_and_soft_delete(self):
        first = self.upload(title="First").json["id"]
        second = self.upload(title="Second").json["id"]
        docs = self.http.get("/api/docs").json["documents"]
        ids = [d["id"] for d in docs]
        self.assertLess(ids.index(second), ids.index(first))
        self.assertEqual({k: docs[ids.index(second)][k] for k in ("title", "filename", "chunks")},
                         {"title": "Second", "filename": "fees.md", "chunks": 1})

        self.assertEqual(self.http.delete(f"/api/docs/{first}").status_code, 204)
        self.assertNotIn(first, [d["id"] for d in self.http.get("/api/docs").json["documents"]])
        self.assertEqual(self.stored(first)[3:], (True, 1))  # soft delete: row and chunk stay
        self.assertEqual(self.http.delete(f"/api/docs/{first}").status_code, 404)
        self.assertEqual(self.http.delete("/api/docs/999999999").status_code, 404)


if __name__ == "__main__":
    unittest.main()
