"""rag-train-3: each saved turn carries the chunks the retriever returned and whether the reply cited them.
Run: npm run test:py"""
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fake_api import FakeApi

import chat  # noqa: E402  (fake_api put be/rag on sys.path)
from functions import over_limit  # noqa: E402
from functions.cited_chunks import cited_chunks  # noqa: E402

HITS = [(0.91, "Fees", "The seller fee is 5%.", 11), (0.72, "Shipping", "Ship within 5 days.", 12)]


class CitedChunks(unittest.TestCase):
    def test_marker_is_the_bracketed_title(self):
        rows = cited_chunks("The fee is 5% [Fees].", HITS)
        self.assertEqual(rows, [{"chunkId": 11, "rank": 1, "score": 0.91, "cited": True},
                                {"chunkId": 12, "rank": 2, "score": 0.72, "cited": False}])

    def test_case_insensitive_and_both(self):
        self.assertEqual([r["cited"] for r in cited_chunks("See [fees] and [SHIPPING]", HITS)], [True, True])

    def test_title_without_brackets_is_not_a_citation(self):
        self.assertEqual([r["cited"] for r in cited_chunks("Fees and Shipping apply", HITS)], [False, False])

    def test_no_reply_or_no_hits(self):
        self.assertEqual([r["cited"] for r in cited_chunks(None, HITS)], [False, False])
        self.assertEqual(cited_chunks("[Fees]", []), [])


class ChatSendsRetrievals(unittest.TestCase):
    def setUp(self):
        over_limit.calls.clear()
        self.api = FakeApi().start(self)
        self.api.chunks = [{"id": 11, "title": "Fees", "text": "The seller fee is 5%.", "embedding": [1.0, 0.0]},
                           {"id": 12, "title": "Shipping", "text": "Ship fees too.", "embedding": [0.9, 0.1]},
                           {"id": 13, "title": "Other", "text": "Unrelated.", "embedding": [0.0, 1.0]}]
        self.client = patch.object(chat, "client", MagicMock()).start()
        self.addCleanup(patch.stopall)
        self.client.models.embed_content.side_effect = lambda model, contents, config: SimpleNamespace(
            embeddings=[SimpleNamespace(values=[1.0, 0.0]) for _ in contents])
        self.http = chat.app.test_client()

    def ask(self):
        return self.http.post("/api/chat", json={"messages": [{"role": "user", "text": "fee?"}], "visitor": "v" * 32})

    def test_answer_logs_ranked_chunks_with_cited_flags(self):
        self.client.models.generate_content.return_value = SimpleNamespace(text="It is 5% [Fees].")
        self.assertEqual(self.ask().json["sources"], ["Fees", "Shipping"])
        retrievals = self.api.turns[0]["retrievals"]
        self.assertEqual([(r["chunkId"], r["rank"], r["cited"]) for r in retrievals], [(11, 1, True), (12, 2, False)])
        self.assertGreater(retrievals[0]["score"], retrievals[1]["score"])

    def test_refused_or_failed_turn_cites_nothing(self):
        self.client.models.generate_content.return_value = SimpleNamespace(text="[Fees] <rules> leak")
        self.ask()
        self.client.models.generate_content.side_effect = RuntimeError("down")
        self.ask()
        for turn in self.api.turns:
            self.assertEqual([r["chunkId"] for r in turn["retrievals"]], [11, 12])
            self.assertFalse(any(r["cited"] for r in turn["retrievals"]))


if __name__ == "__main__":
    unittest.main()
