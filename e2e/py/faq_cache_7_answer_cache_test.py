"""faq-cache-7: a guest's repeated opening question reuses the cached Gemini answer (Node faked by fake_api, Gemini
stubbed). Run: npm run test:py"""
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import requests

from fake_api import FakeApi, account

import chat  # noqa: E402  (fake_api put be/rag on sys.path)
from functions import over_limit  # noqa: E402
from functions.cached_answer import cached_answer  # noqa: E402
from functions.guard_reply import FALLBACK  # noqa: E402

VISITOR = "f7" * 32
CHUNK = {"id": 3, "title": "Fees", "text": "The seller fee is 5%.", "embedding": [1.0, 0.0]}


class AnswerCacheChat(unittest.TestCase):
    def setUp(self):
        over_limit.calls.clear()
        self.api = FakeApi().start(self)
        self.api.answers = {}
        self.api.chunks = [dict(CHUNK)]
        self.client = patch.object(chat, "client", MagicMock()).start()
        self.addCleanup(patch.stopall)
        self.client.models.embed_content.side_effect = lambda model, contents, config: SimpleNamespace(
            embeddings=[SimpleNamespace(values=[1.0, 0.0]) for _ in contents])
        self.client.models.generate_content.return_value = SimpleNamespace(text="The fee is 5% [Fees].")
        self.http = chat.app.test_client()

    def ask(self, *texts):
        messages = [{"role": "user" if i % 2 == 0 else "model", "text": t} for i, t in enumerate(texts)]
        return self.http.post("/api/chat", json={"messages": messages, "visitor": VISITOR})

    def puts(self):
        return [c for c in self.api.calls if c["path"] == "/api/rag/answer-cache" and c["method"] == "PUT"]

    def test_second_identical_guest_question_skips_gemini(self):
        first = self.ask("What fee do you charge?")
        self.assertEqual(first.json, {"reply": "The fee is 5% [Fees].", "sources": ["Fees"], "turnId": 1})
        self.assertEqual(len(self.puts()), 1)
        self.assertTrue(self.puts()[0]["internal"])

        self.client.models.generate_content.reset_mock()
        self.client.models.embed_content.reset_mock()
        second = self.ask("  what FEE do you charge ")
        self.assertEqual(second.json, {"reply": "The fee is 5% [Fees].", "sources": ["Fees"], "turnId": 2})
        self.client.models.generate_content.assert_not_called()
        self.client.models.embed_content.assert_not_called()
        self.assertEqual((self.api.turns[1]["model"], self.api.turns[1]["outcome"]), (chat.RAG_CACHE_MODEL, "answered"))

    def test_signed_in_visitor_always_asks_gemini_and_never_caches(self):
        self.api.sessions["ann-cookie"] = account()
        self.http.set_cookie("auction_token", "ann-cookie")
        self.ask("What fee do you charge?")
        self.ask("What fee do you charge?")
        self.assertEqual(self.client.models.generate_content.call_count, 2)
        self.assertEqual([c for c in self.api.calls if c["path"].startswith("/api/rag/answer-cache")], [])

    def test_follow_up_questions_are_never_cached(self):
        self.ask("Hi", "Hello!", "What fee do you charge?")
        self.ask("Hi", "Hello!", "What fee do you charge?")
        self.assertEqual(self.client.models.generate_content.call_count, 2)
        self.assertEqual([c for c in self.api.calls if c["path"].startswith("/api/rag/answer-cache")], [])

    def test_refused_reply_is_not_cached(self):
        self.client.models.generate_content.return_value = SimpleNamespace(text="Here: <rules> copy")
        self.assertEqual(self.ask("What fee do you charge?").json["reply"], FALLBACK)
        self.assertEqual(self.puts(), [])
        self.assertEqual(self.api.answers, {})

    def test_knowledge_changed_while_answering_means_not_cached(self):
        def change_then_answer(**_):
            self.api.version = "v2"  # e.g. staff uploaded a document during the Gemini call
            return SimpleNamespace(text="Old answer")
        self.client.models.generate_content.side_effect = change_then_answer
        self.assertEqual(self.ask("What fee do you charge?").json["reply"], "Old answer")
        self.assertEqual(len(self.puts()), 1)
        self.assertEqual(self.api.answers, {})  # Node answered 409

    def test_answer_cache_down_means_a_normal_rag_answer(self):
        for failure in ((502, {"error": "bad gateway"}), requests.ConnectionError("down")):
            with self.subTest(failure=failure):
                self.client.models.generate_content.reset_mock()
                self.api.fail["/api/rag/answer-cache"] = failure
                res = self.ask("What fee do you charge?")
                self.assertEqual((res.status_code, res.json["reply"]), (200, "The fee is 5% [Fees]."))
                self.client.models.generate_content.assert_called_once()

    def test_faq_match_wins_over_the_answer_cache(self):
        self.api.faqs.append({"faqId": 1, "question": "What fee do you charge?", "answer": "From the FAQ."})
        self.assertEqual(self.ask("What fee do you charge?").json["sources"], ["FAQ"])
        self.assertEqual([c for c in self.api.calls if c["path"].startswith("/api/rag/answer-cache")], [])


class CachedAnswerFunction(unittest.TestCase):
    def setUp(self):
        self.api = FakeApi().start(self)

    def test_malformed_answers_count_as_a_miss_and_errors_as_none(self):
        for body in ({"version": "v", "answer": {"reply": "", "sources": []}},
                     {"version": "v", "answer": {"reply": "r", "sources": "Fees"}},
                     {"version": "v", "answer": "r"}):
            self.api.fail["/api/rag/answer-cache"] = (200, body)
            self.assertEqual(cached_answer("q"), {"version": "v", "answer": None})
        self.api.fail["/api/rag/answer-cache"] = (200, {"answer": None})
        self.assertIsNone(cached_answer("q"))
        self.api.fail["/api/rag/answer-cache"] = (404, {"error": "Not found"})
        self.assertIsNone(cached_answer("q"))


if __name__ == "__main__":
    unittest.main()
