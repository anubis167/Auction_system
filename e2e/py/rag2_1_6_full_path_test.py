"""rag2-1.6 full path: Flask (be/rag/chat.py) -> the real Node API (be/src/server.ts) -> Postgres (auction_test).
Only Gemini is stubbed. Starts its own Node server on port 4210 after seeding the demo users (idempotent upserts).
Needs the db container up (npm test brings it up first). Run: npm run test:py"""
import io
import os
import subprocess
import sys
import time
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import requests

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "be", "rag"))
import chat  # noqa: E402
from functions import over_limit  # noqa: E402
from functions.load_prompt import load_prompt  # noqa: E402

PORT = 4210
API = f"http://127.0.0.1:{PORT}"
TOKEN = "full-path-internal-token"
NODE_ENV = {
    **os.environ,
    "DATABASE_URL": os.getenv("RAG_TEST_DATABASE_URL", "postgresql://auction:auction@localhost:5436/auction_test"),
    "PORT": str(PORT), "JWT_SECRET": "full-path-secret", "NODE_ENV": "test", "RAG_INTERNAL_TOKEN": TOKEN,
    "GMAIL_USER": "", "GMAIL_CLIENT_ID": "", "GMAIL_CLIENT_SECRET": "", "GMAIL_REFRESH_TOKEN": "", "SMTP_HOST": "",
}
TSX = [os.path.join(ROOT, "node_modules", ".bin", "tsx.cmd" if os.name == "nt" else "tsx")]
DIMS = 8


def vector(text):
    """Stub embedding in 8 dims: the 'reserve' questions and documents share the last axis, anything else the first.
    Other documents left in auction_test (2-3 dim test vectors) score 0 against it."""
    return [0.0] * (DIMS - 1) + [1.0] if "reserve" in text.lower() else [1.0] + [0.0] * (DIMS - 1)


def stop(proc):
    if os.name == "nt":  # tsx starts a child node process; take the whole tree down
        subprocess.run(["taskkill", "/T", "/F", "/PID", str(proc.pid)], capture_output=True)
    else:
        proc.kill()
    proc.wait(timeout=30)


class FullPath(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        subprocess.run(TSX + ["be/prisma/seed.ts"], cwd=ROOT, env=NODE_ENV, check=True, capture_output=True, timeout=120)
        cls.server = subprocess.Popen(TSX + ["be/src/server.ts"], cwd=ROOT, env=NODE_ENV,
                                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        deadline = time.time() + 90
        while True:
            try:
                if requests.get(f"{API}/api/health", timeout=2).ok:
                    break
            except requests.RequestException:
                pass
            if time.time() > deadline or cls.server.poll() is not None:
                stop(cls.server)
                raise RuntimeError("the Node API did not start on port 4210")
            time.sleep(0.5)
        cls.cookies = {who: cls.login(who) for who in ("staff", "alice")}

    @classmethod
    def tearDownClass(cls):
        stop(cls.server)

    @staticmethod
    def login(who):
        res = requests.post(f"{API}/api/auth/login", json={"identifier": who, "password": "Password123!"}, timeout=10)
        res.raise_for_status()
        return res.cookies["auction_token"]

    def setUp(self):
        over_limit.calls.clear()
        patch.dict(os.environ, {"RAG_API_URL": API, "RAG_INTERNAL_TOKEN": TOKEN}).start()
        self.client = patch.object(chat, "client", MagicMock()).start()
        self.addCleanup(patch.stopall)
        self.client.models.embed_content.side_effect = lambda model, contents, config: SimpleNamespace(
            embeddings=[SimpleNamespace(values=vector(t)) for t in contents])
        self.client.models.generate_content.return_value = SimpleNamespace(text="answer")
        self.http = chat.app.test_client()

    def as_user(self, who):
        self.http.set_cookie("auction_token", self.cookies[who] if who in self.cookies else who)

    def ask(self, text):
        res = self.http.post("/api/chat", json={"messages": [{"role": "user", "text": text}]})
        return res, self.client.models.generate_content.call_args.kwargs["config"]["system_instruction"]

    def test_upload_ask_delete(self):
        title = f"Reserve rules {uuid.uuid4().hex[:8]}"
        self.as_user("staff")
        res = self.http.post("/api/docs", data={"file": (io.BytesIO(
            b"A reserve price is the lowest price a seller accepts. Lots below it do not sell."), "reserve.md"),
            "title": title}, content_type="multipart/form-data")
        self.assertEqual(res.status_code, 201, res.json)
        doc_id = res.json["id"]
        self.assertIn(doc_id, [d["id"] for d in self.http.get("/api/docs").json["documents"]])

        # A customer asks: the excerpt and their own account (from Node, via their cookie) reach Gemini
        self.as_user("alice")
        res, prompt = self.ask("What is a reserve price?")
        self.assertEqual(res.json, {"reply": "answer", "sources": [title]})
        self.assertIn("A reserve price is the lowest price a seller accepts.", prompt)
        self.assertIn("Username: <untrusted>alice</untrusted>", prompt)
        self.assertNotIn(load_prompt("guest"), prompt)

        # Customers cannot manage documents (Node's knowledge.manage)
        self.assertEqual(self.http.get("/api/docs").status_code, 403)
        self.assertEqual(self.http.delete(f"/api/docs/{doc_id}").status_code, 403)

        # A forged cookie is a guest: Node rejects it, Python never decides
        self.as_user("forged.cookie.value")
        _, prompt = self.ask("What is a reserve price?")
        self.assertIn(load_prompt("guest"), prompt)

        # Soft delete through Flask -> Node: the excerpt is gone
        self.as_user("staff")
        self.assertEqual(self.http.delete(f"/api/docs/{doc_id}").status_code, 204)
        self.assertEqual(self.http.delete(f"/api/docs/{doc_id}").status_code, 404)
        self.as_user("alice")
        res, prompt = self.ask("What is a reserve price?")
        self.assertEqual(res.json, {"reply": "answer"})
        self.assertNotIn("lowest price a seller accepts", prompt)

    def test_turns_are_saved_by_the_real_api(self):
        """rag-train-2: the turn write goes through Node into rag_turns; the reply carries the new row's id."""
        visitor = uuid.uuid4().hex * 2
        ids = []
        for who in ("alice", None, None):
            self.http.delete_cookie("auction_token")
            if who:
                self.as_user(who)
            res = self.http.post("/api/chat", json={"messages": [{"role": "user", "text": "Hi"}], "visitor": visitor})
            self.assertEqual(res.status_code, 200, res.json)
            ids.append(res.json["turnId"])
        self.assertTrue(all(isinstance(i, int) for i in ids) and len(set(ids)) == 3, ids)

    def test_wrong_service_token_means_no_excerpts_and_no_upload(self):
        os.environ["RAG_INTERNAL_TOKEN"] = "wrong-token"
        self.as_user("staff")
        res = self.http.post("/api/docs", data={"file": (io.BytesIO(b"reserve text"), "r.md")},
                             content_type="multipart/form-data")
        self.assertEqual(res.status_code, 502)  # Node refused the service token: a server fault, not the staff's
        res, prompt = self.ask("What is a reserve price?")
        self.assertEqual(res.status_code, 200)
        self.assertNotIn("Excerpts from Beat'em", prompt)


if __name__ == "__main__":
    unittest.main()
