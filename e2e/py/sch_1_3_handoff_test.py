"""sch-1.3 unit: /api/chat hands a signed-in customer to staff when the bot is rate limited or Gemini fails.
Gemini and the db are stubbed. Run: npm run test:py"""
import os
import sys
import unittest
from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "be", "rag"))
import chat  # noqa: E402
import rag  # noqa: E402

ASK = {"messages": [{"role": "user", "text": "Where is my parcel?"}]}
CUSTOMER = {"id": 7, "role": "customer"}


class Handoff(unittest.TestCase):
    def setUp(self):
        chat.web_calls.clear()
        self.client = patch.object(chat, "client", MagicMock()).start()
        self.addCleanup(patch.stopall)
        self.client.models.embed_content.side_effect = lambda model, contents, config: SimpleNamespace(
            embeddings=[SimpleNamespace(values=[0.0, 1.0]) for _ in contents])
        self.client.models.generate_content.return_value = SimpleNamespace(text="answer")
        patch.object(rag, "connect", lambda: nullcontext(MagicMock())).start()
        patch.object(rag, "user_context", return_value="\nAccount: test").start()
        patch.object(rag, "retrieve", return_value=[]).start()
        self.user = patch.object(rag, "session_user", return_value=CUSTOMER).start()
        self.http = chat.app.test_client()

    def ask(self):
        return self.http.post("/api/chat", json=ASK)

    def use_up_limit(self):
        for _ in range(chat.WEB_CALLS_PER_MINUTE):
            self.assertEqual(self.ask().status_code, 200)

    def test_in_scope_answer_is_unchanged(self):
        res = self.ask()
        self.assertEqual((res.status_code, res.json), (200, {"reply": "answer"}))

    def test_limit_hands_customer_to_staff(self):
        self.use_up_limit()
        self.client.reset_mock()
        res = self.ask()
        self.assertEqual((res.status_code, res.json), (200, {"handoff": True, "reason": "limit"}))
        self.client.models.generate_content.assert_not_called()
        self.client.models.embed_content.assert_not_called()

    def test_gemini_failure_hands_customer_to_staff(self):
        self.client.models.generate_content.side_effect = RuntimeError("503 high demand")
        self.assertEqual(self.ask().json, {"handoff": True, "reason": "unavailable"})
        self.client.models.generate_content.side_effect = None
        self.client.models.generate_content.return_value = SimpleNamespace(text=None)
        self.assertEqual(self.ask().json, {"handoff": True, "reason": "unavailable"})

    def test_guests_keep_the_errors(self):
        self.user.return_value = None
        self.client.models.generate_content.side_effect = RuntimeError("down")
        self.assertEqual(self.ask().status_code, 503)
        self.client.models.generate_content.side_effect = None
        chat.web_calls.clear()
        self.use_up_limit()
        res = self.ask()
        self.assertEqual(res.status_code, 429)
        self.assertNotIn("handoff", res.json)

    def test_staff_and_admin_are_not_handed_off(self):
        for role in ("staff", "admin"):
            self.user.return_value = {"id": 1, "role": role}
            self.client.models.generate_content.side_effect = RuntimeError("down")
            self.assertEqual(self.ask().status_code, 503, role)

    def test_db_down_means_guest_errors(self):
        patch.object(rag, "connect", side_effect=OSError("db down")).start()
        self.client.models.generate_content.side_effect = RuntimeError("down")
        self.assertEqual(self.ask().status_code, 503)


if __name__ == "__main__":
    unittest.main()
