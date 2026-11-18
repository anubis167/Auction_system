"""rag2-1.5: /api/docs upload, list and delete through the API (Node faked by fake_api, Gemini stubbed).
Carries over round 12's rag_docs_test cases; token forgery is Node's job now (be/tests auth suites, rag2-1.6).
Run: npm run test:py"""
import io
import unittest

import requests
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fake_api import FakeApi, account

import chat  # noqa: E402
from functions.read_upload import DOC_MAX_BYTES  # noqa: E402


class Docs(unittest.TestCase):
    def setUp(self):
        self.api = FakeApi().start(self)
        self.client = patch.object(chat, "client", MagicMock()).start()
        self.addCleanup(patch.stopall)
        # Vector [1, i]: position i of each upload, to check order
        self.client.models.embed_content.side_effect = lambda model, contents, config: SimpleNamespace(
            embeddings=[SimpleNamespace(values=[1.0, float(i)]) for i in range(len(contents))])
        self.http = chat.app.test_client()
        for role in ("staff", "admin", "customer"):
            self.api.sessions[role] = account(role=role, username=role)
        self.login("staff")

    def login(self, who):
        if who:
            self.http.set_cookie("auction_token", who)
        else:
            self.http.delete_cookie("auction_token")

    def upload(self, data=b"The seller fee is 5%.", filename="fees.md", title=None):
        form = {"file": (io.BytesIO(data), filename)}
        if title is not None:
            form["title"] = title
        return self.http.post("/api/docs", data=form, content_type="multipart/form-data")

    def test_upload_sends_document_chunks_and_vectors(self):
        res = self.upload((("Paragraph. " * 60) + "\n\n").encode() * 4, "guide.md", " Seller guide ")
        self.assertEqual(res.status_code, 201, res.json)
        self.assertEqual(res.json["title"], "Seller guide")
        self.assertGreater(res.json["chunks"], 1)
        call = self.api.calls[-1]
        self.assertEqual((call["method"], call["path"], call["cookie"], call["internal"]),
                         ("POST", "/api/rag/documents", "staff", True))
        doc = self.api.documents[0]
        self.assertEqual((doc["title"], doc["filename"], doc["mimeType"]), ("Seller guide", "guide.md", "text/markdown"))
        self.assertEqual([c["embedding"] for c in doc["chunks"]], [[1.0, float(i)] for i in range(res.json["chunks"])])
        self.assertEqual(self.client.models.embed_content.call_args.kwargs["config"]["task_type"], "RETRIEVAL_DOCUMENT")

    def test_title_defaults_to_file_name_and_admin_may_upload(self):
        self.login("admin")
        res = self.upload(filename="notes.txt")
        self.assertEqual((res.status_code, res.json["title"]), (201, "notes"))
        self.assertEqual(self.api.documents[0]["mimeType"], "text/plain")

    def test_auth_is_checked_before_gemini(self):
        for who, status in [(None, 401), ("customer", 403), ("forged", 401)]:
            self.login(who)
            self.assertEqual(self.upload().status_code, status, who)
            self.assertEqual(self.http.get("/api/docs").status_code, status, who)
            self.assertEqual(self.http.delete("/api/docs/1").status_code, status, who)
        self.client.models.embed_content.assert_not_called()
        self.assertEqual(self.api.documents, [])

    def test_node_refusal_on_save_is_passed_on(self):
        # Permission revoked between the check and the save: Node's 403 reaches the browser as it is
        self.api.fail["/api/rag/documents"] = (403, {"error": "You do not have permission to do this"})
        self.api.sessions["staff"] = account(role="staff")
        res = self.upload()
        self.assertEqual((res.status_code, res.json), (403, {"error": "You do not have permission to do this"}))

    def test_service_token_refused_on_save_is_502(self):
        self.api.fail["/api/rag/documents"] = (401, {"error": "Invalid internal token"})
        self.assertEqual(self.upload().status_code, 502)

    def test_api_failures_are_502(self):
        for failure in [(500, {"error": "boom"}), (200, b"oops"), (201, {"no": "id"}), requests.ConnectionError("refused")]:
            self.api.fail["/api/rag/documents"] = failure
            self.assertEqual(self.upload().status_code, 502, failure)
        self.api.fail["/api/rag/documents"] = (200, {"documents": "nope"})
        self.assertEqual(self.http.get("/api/docs").status_code, 502)
        self.api.fail = {"/api/rag/me": (500, {"error": "boom"})}
        self.assertEqual(self.upload().status_code, 502)

    def test_bad_files_send_nothing(self):
        cases = [(b"x", "a.pdf", 400), (b"x", "noext", 400), (b"\xff\xfe\x00bad", "a.txt", 400), (b"  \n\n ", "a.md", 400),
                 (b"x" * (DOC_MAX_BYTES + 1), "big.txt", 413), (b"x" * (DOC_MAX_BYTES + 100_000), "huge.txt", 413)]
        for data, name, status in cases:
            self.assertEqual(self.upload(data, name).status_code, status, name)
        self.assertEqual(self.http.post("/api/docs", data={}, content_type="multipart/form-data").status_code, 400)
        self.assertEqual(self.api.documents, [])
        self.client.models.embed_content.assert_not_called()

    @patch("functions.embed.time.sleep")
    def test_embedding_failure_sends_nothing(self, _sleep):
        self.client.models.embed_content.side_effect = TimeoutError("down")
        self.assertEqual(self.upload().status_code, 503)
        self.assertFalse(any(c["method"] == "POST" for c in self.api.calls))

    def test_list_newest_first_and_soft_delete(self):
        first = self.upload(title="First").json["id"]
        second = self.upload(title="Second").json["id"]
        docs = self.http.get("/api/docs").json["documents"]
        self.assertEqual([d["id"] for d in docs], [second, first])
        self.assertEqual(self.http.delete(f"/api/docs/{first}").status_code, 204)
        self.assertEqual([d["id"] for d in self.http.get("/api/docs").json["documents"]], [second])
        self.assertTrue(self.api.documents[0]["deleted"])
        self.assertEqual(self.http.delete(f"/api/docs/{first}").status_code, 404)
        self.assertEqual(self.http.delete("/api/docs/999999999").status_code, 404)
        self.assertEqual(self.api.calls[-1]["cookie"], "staff")


if __name__ == "__main__":
    unittest.main()
