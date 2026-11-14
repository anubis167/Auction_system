"""rag-1.3 unit tests for embed (Gemini stubbed, no sleeping). Run: python be/rag/rag_embed_test.py"""
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from google.genai import errors

import rag


def reply(contents, **_):
    return SimpleNamespace(embeddings=[SimpleNamespace(values=[float(len(t)), 1.0]) for t in contents])


def api_error(code):
    return errors.APIError(code, {"error": {"code": code, "message": "x", "status": "x"}})


@patch("rag.time.sleep")
class Embed(unittest.TestCase):
    def setUp(self):
        self.client = MagicMock()
        self.calls = self.client.models.embed_content

    def test_batches_keep_order(self, sleep):
        self.calls.side_effect = lambda model, contents, config: reply(contents)
        texts = ["a" * (i % 7 + 1) for i in range(250)]
        vectors = rag.embed(self.client, texts, "RETRIEVAL_DOCUMENT")
        self.assertEqual(vectors, [[float(len(t)), 1.0] for t in texts])
        self.assertEqual([len(c.kwargs["contents"]) for c in self.calls.call_args_list], [100, 100, 50])
        self.assertEqual(self.calls.call_args.kwargs["config"], {"task_type": "RETRIEVAL_DOCUMENT", "output_dimensionality": rag.EMBED_DIMENSIONS})
        self.assertEqual(self.calls.call_args.kwargs["model"], rag.EMBED_MODEL)
        sleep.assert_not_called()

    def test_503_and_timeout_then_success(self, sleep):
        self.calls.side_effect = [api_error(503), TimeoutError("slow"), reply(["q"])]
        self.assertEqual(rag.embed(self.client, ["q"], "RETRIEVAL_QUERY"), [[1.0, 1.0]])
        self.assertEqual([c.args[0] for c in sleep.call_args_list], [1, 2])

    def test_429_is_retried(self, sleep):
        self.calls.side_effect = [api_error(429), reply(["q"])]
        self.assertEqual(len(rag.embed(self.client, ["q"], "RETRIEVAL_QUERY")), 1)

    def test_400_is_not_retried(self, sleep):
        self.calls.side_effect = api_error(400)
        with self.assertRaises(rag.EmbedError):
            rag.embed(self.client, ["q"], "RETRIEVAL_QUERY")
        self.assertEqual(self.calls.call_count, 1)
        sleep.assert_not_called()

    def test_gives_up_after_the_limit(self, sleep):
        self.calls.side_effect = api_error(500)
        with self.assertRaises(rag.EmbedError):
            rag.embed(self.client, ["q"], "RETRIEVAL_QUERY")
        self.assertEqual(self.calls.call_count, rag.EMBED_TRIES)

    def test_short_answer_is_an_error(self, sleep):
        self.calls.return_value = reply(["only one"])
        with self.assertRaises(rag.EmbedError):
            rag.embed(self.client, ["a", "b"], "RETRIEVAL_DOCUMENT")


if __name__ == "__main__":
    unittest.main()
