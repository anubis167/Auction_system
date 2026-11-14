"""rag-1.5: ranking (unit) and /api/chat grounded in uploaded documents (integration on auction_test, Gemini stubbed).
Run: python be/rag_chat_test.py"""
import io
import os
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import psycopg

os.environ["DATABASE_URL"] = os.getenv("RAG_TEST_DATABASE_URL", "postgresql://auction:auction@localhost:5436/auction_test")
import chat  # noqa: E402
import rag  # noqa: E402
from rag_docs_test import PREFIX, token  # noqa: E402


class Ranking(unittest.TestCase):
    def test_cosine(self):
        self.assertAlmostEqual(rag.cosine([1, 0], [2, 0]), 1.0)
        self.assertAlmostEqual(rag.cosine([1, 0], [0, 3]), 0.0)
        self.assertEqual(rag.cosine([0, 0], [1, 0]), 0.0)  # empty vector, no ZeroDivisionError

    def test_rank_keeps_the_best_above_the_threshold(self):
        rows = [("A", "a", [1, 0]), ("B", "b", [0.9, 0.1]), ("C", "c", [0, 1]), ("D", "d", []), ("E", "e", [0.7, 0.3])]
        hits = rag.rank(rows, [1, 0], k=2, min_score=0.5)
        self.assertEqual([title for _, title, _ in hits], ["A", "B"])
        self.assertEqual(rag.rank(rows, [1, 0], k=9, min_score=0.99)[0][1], "A")
        self.assertEqual(rag.rank(rows, [-1, 0]), [])

    def test_context_block(self):
        self.assertEqual(rag.context_block([]), "")
        block = rag.context_block([(0.9, "Fees", "Commission is 5%.")])
        self.assertIn("[Fees]\nCommission is 5%.", block)
        self.assertIn("do not state facts", block)


# Stub embeddings: a text about fees points one way, shipping another, anything else a third
def vector(text):
    text = text.lower()
    return [1.0, 0.0, 0.0] if "fee" in text else [0.0, 1.0, 0.0] if "ship" in text else [0.0, 0.0, 1.0]


def fake_embed(model, contents, config):
    return SimpleNamespace(embeddings=[SimpleNamespace(values=vector(t)) for t in contents])


class GroundedChat(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            cls.db = psycopg.connect(os.environ["DATABASE_URL"], connect_timeout=3, autocommit=True)
        except psycopg.OperationalError as e:
            raise unittest.SkipTest(f"Postgres not reachable: {e}")
        cls.cleanup()
        cls.staff = cls.db.execute(
            "INSERT INTO users (email, username, password_hash, role, updated_at) "
            "VALUES (%s, %s, 'x', 'staff', now()) RETURNING id", (f"{PREFIX}chat@test.local", f"{PREFIX}chat")).fetchone()[0]

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
        # Other documents in auction_test would also be searched: hide them for this test
        self.db.execute("UPDATE knowledge_documents SET deleted_at = now() WHERE deleted_at IS NULL")
        chat.web_calls.clear()
        self.client = patch.object(chat, "client", MagicMock()).start()
        self.addCleanup(patch.stopall)
        self.client.models.embed_content.side_effect = fake_embed
        self.client.models.generate_content.return_value = SimpleNamespace(text="answer")
        self.http = chat.app.test_client()
        self.http.set_cookie(rag.COOKIE, token(self.staff))

    def upload(self, title, text):
        res = self.http.post("/api/docs", data={"file": (io.BytesIO(text.encode()), "doc.md"), "title": title},
                             content_type="multipart/form-data")
        self.assertEqual(res.status_code, 201, res.json)
        return res.json["id"]

    def ask(self, question):
        res = self.http.post("/api/chat", json={"messages": [{"role": "user", "text": question}]})
        prompt = self.client.models.generate_content.call_args.kwargs["config"]["system_instruction"]
        return res, prompt

    def test_matching_document_reaches_gemini(self):
        self.upload("Fees", "The seller fee is 5% of the final price.")
        self.upload("Shipping", "Sellers ship within 5 days.")
        res, prompt = self.ask("What fee do you charge?")
        self.assertEqual(res.json, {"reply": "answer", "sources": ["Fees"]})
        self.assertTrue(prompt.startswith(chat.WEB_PROMPT))
        self.assertIn("[Fees]\nThe seller fee is 5% of the final price.", prompt)
        self.assertNotIn("Sellers ship", prompt)
        self.assertEqual(self.client.models.embed_content.call_args.kwargs["config"]["task_type"], "RETRIEVAL_QUERY")

    def test_no_match_means_no_context(self):
        self.upload("Fees", "The seller fee is 5% of the final price.")
        res, prompt = self.ask("Tell me a joke")
        self.assertEqual((res.status_code, res.json, prompt), (200, {"reply": "answer"}, chat.WEB_PROMPT))

    def test_soft_deleted_document_is_not_used(self):
        doc_id = self.upload("Fees", "The seller fee is 5% of the final price.")
        self.assertEqual(self.http.delete(f"/api/docs/{doc_id}").status_code, 204)
        _, prompt = self.ask("What fee do you charge?")
        self.assertEqual(prompt, chat.WEB_PROMPT)

    def test_search_failures_still_answer(self):
        self.upload("Fees", "The seller fee is 5% of the final price.")
        with patch.object(rag, "connect", side_effect=psycopg.OperationalError("db down")):
            res, prompt = self.ask("What fee do you charge?")
        self.assertEqual((res.status_code, prompt), (200, chat.WEB_PROMPT))

        self.client.models.embed_content.side_effect = TimeoutError("down")
        with patch("rag.time.sleep"):
            res, prompt = self.ask("What fee do you charge?")
        self.assertEqual((res.status_code, prompt), (200, chat.WEB_PROMPT))


if __name__ == "__main__":
    unittest.main()
