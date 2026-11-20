"""chat-cache: POST /api/chat reuses a Redis-cached Gemini reply. Redis is replaced by an in-memory dict; the real
server is checked by hand (see docs/rag.md). Run: npm run test:py"""
import unittest

import redis
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fake_api import FakeApi, account

import chat  # noqa: E402  (fake_api put be/rag on sys.path)
from functions import chat_cache as cache_module, over_limit  # noqa: E402

ASK = [{"role": "user", "text": "What fee do you charge?"}]


class FakeRedis:
    def __init__(self, fail=False):
        self.data, self.fail, self.ttl = {}, fail, {}

    def get(self, key):
        if self.fail:
            raise redis.ConnectionError("down")
        return self.data.get(key)

    def set(self, key, value, ex):
        if self.fail:
            raise redis.ConnectionError("down")
        self.data[key] = value.encode("utf-8")
        self.ttl[key] = ex


class ChatCache(unittest.TestCase):
    def setUp(self):
        over_limit.calls.clear()
        self.api = FakeApi().start(self)
        self.client = patch.object(chat, "client", MagicMock()).start()
        self.client.models.generate_content.return_value = SimpleNamespace(text="answer")
        self.store = FakeRedis()
        patch.dict("os.environ", {"REDIS_URL": "redis://fake"}).start()
        patch.object(cache_module, "_store", self.store).start()
        patch.object(chat, "retrieve", return_value=[]).start()
        self.addCleanup(patch.stopall)
        self.http = chat.app.test_client()

    def post(self):
        return self.http.post("/api/chat", json={"messages": ASK})

    def sign_in(self, cookie, **user):
        self.api.sessions[cookie] = account(**user)
        self.http.set_cookie("auction_token", cookie)

    def test_repeat_question_is_served_from_cache(self):
        first, second = self.post(), self.post()
        self.assertEqual((first.json, second.json), ({"reply": "answer"}, {"reply": "answer"}))
        self.assertEqual(self.client.models.generate_content.call_count, 1)
        self.assertEqual(list(self.store.ttl.values()), [cache_module.TTL_SECONDS])

    def test_different_visitor_does_not_share_the_entry(self):
        self.sign_in("ann-cookie", username="ann")
        self.post()
        self.sign_in("bob-cookie", username="bob")
        self.post()
        self.assertEqual(self.client.models.generate_content.call_count, 2)

    def test_failed_gemini_reply_is_not_cached(self):
        self.client.models.generate_content.side_effect = [RuntimeError("503"), SimpleNamespace(text="answer")]
        self.assertEqual(self.post().status_code, 503)
        self.assertEqual(self.post().json, {"reply": "answer"})
        self.assertEqual(len(self.store.data), 1)

    def test_redis_down_still_answers_from_gemini(self):
        self.store.fail = True
        self.assertEqual(self.post().json, {"reply": "answer"})
        self.assertEqual(self.post().json, {"reply": "answer"})
        self.assertEqual(self.client.models.generate_content.call_count, 2)

    def test_no_redis_url_means_no_cache(self):
        with patch.dict("os.environ", {"REDIS_URL": ""}):
            cache_module._store = None
            self.post()
            self.post()
        self.assertEqual(self.client.models.generate_content.call_count, 2)


if __name__ == "__main__":
    unittest.main()
