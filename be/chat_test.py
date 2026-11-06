"""chat-1.2 self-check for POST /api/chat. Run: python be/chat_test.py (Gemini is stubbed, no network)."""
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock

import chat


class WebChat(unittest.TestCase):
    def setUp(self):
        chat.web_calls.clear()
        chat.client = MagicMock()
        chat.client.models.generate_content.return_value = SimpleNamespace(text="hello")
        self.http = chat.app.test_client()

    def post(self, messages):
        return self.http.post("/api/chat", json={"messages": messages})

    def test_reply_and_history_reach_gemini(self):
        res = self.post([{"role": "user", "text": "a"}, {"role": "model", "text": "b"}, {"role": "user", "text": "c"}])
        self.assertEqual((res.status_code, res.json), (200, {"reply": "hello"}))
        contents = chat.client.models.generate_content.call_args.kwargs["contents"]
        self.assertEqual([c["role"] for c in contents], ["user", "model", "user"])
        self.assertEqual(contents[2]["parts"], [{"text": "c"}])

    def test_bad_input_is_refused_without_calling_gemini(self):
        ok = {"role": "user", "text": "a"}
        for bad in ([], "x", [ok] * (chat.MAX_TURNS + 1), [{"role": "system", "text": "a"}], [{"role": "user", "text": ""}],
                    [{"role": "user", "text": 5}], [{"role": "user", "text": "a" * (chat.MAX_TEXT + 1)}],
                    [{"role": "model", "text": "a"}], ["a"]):
            self.assertEqual(self.post(bad).status_code, 400, bad)
        self.assertEqual(self.http.post("/api/chat", data="not json").status_code, 400)
        chat.client.models.generate_content.assert_not_called()

    def test_long_bot_reply_does_not_end_the_conversation(self):
        long_reply = "b" * (chat.MAX_TEXT + 1)
        res = self.post([{"role": "user", "text": "a"}, {"role": "model", "text": long_reply}, {"role": "user", "text": "c"}])
        self.assertEqual(res.status_code, 200)
        contents = chat.client.models.generate_content.call_args.kwargs["contents"]
        self.assertEqual(len(contents[1]["parts"][0]["text"]), chat.MAX_TEXT)

    def test_rate_limit(self):
        ok = [{"role": "user", "text": "a"}]
        for _ in range(chat.WEB_CALLS_PER_MINUTE):
            self.assertEqual(self.post(ok).status_code, 200)
        self.assertEqual(self.post(ok).status_code, 429)

    def test_gemini_failure_and_empty_reply(self):
        ok = [{"role": "user", "text": "a"}]
        chat.client.models.generate_content.return_value = SimpleNamespace(text=None)
        self.assertEqual(self.post(ok).status_code, 503)
        chat.client.models.generate_content.side_effect = RuntimeError("down")
        self.assertEqual(self.post(ok).status_code, 503)

    def test_messenger_echo_gets_no_reply(self):
        chat.send_facebook_message = MagicMock()
        event = {"sender": {"id": "1"}, "message": {"text": "hi", "is_echo": True}}
        res = self.http.post("/webhook", json={"object": "page", "entry": [{"messaging": [event]}]})
        self.assertEqual(res.status_code, 200)
        chat.send_facebook_message.assert_not_called()


if __name__ == "__main__":
    unittest.main()
