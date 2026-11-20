"""rag2-1.4: POST /api/chat on the API (Node faked by fake_api, Gemini stubbed). Carries over the cases of round 12's
chat_test, rag_chat_test and rag_user_test. Run: npm run test:py"""
import unittest

import requests
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fake_api import FakeApi, account

import chat  # noqa: E402  (fake_api put be/rag on sys.path)
from functions import over_limit  # noqa: E402
from functions.check_messages import MAX_TEXT, MAX_TURNS  # noqa: E402
from functions.guard_reply import FALLBACK, guard_reply  # noqa: E402
from functions.load_prompt import load_prompt  # noqa: E402

GUEST = load_prompt("guest")
EXCERPTS = "Excerpts from Beat'em's own documents"  # first line of prompts/excerpts.md
ASK = [{"role": "user", "text": "What fee do you charge?"}]


# Stub embeddings: a text about fees points one way, shipping another, anything else a third
def vector(text):
    text = text.lower()
    return [1.0, 0.0, 0.0] if "fee" in text else [0.0, 1.0, 0.0] if "ship" in text else [0.0, 0.0, 1.0]


class ChatBase(unittest.TestCase):
    def setUp(self):
        over_limit.calls.clear()
        self.api = FakeApi().start(self)
        self.client = patch.object(chat, "client", MagicMock()).start()
        self.addCleanup(patch.stopall)
        self.client.models.embed_content.side_effect = lambda model, contents, config: SimpleNamespace(
            embeddings=[SimpleNamespace(values=vector(t)) for t in contents])
        self.client.models.generate_content.return_value = SimpleNamespace(text="answer")
        self.http = chat.app.test_client()

    def post(self, messages=ASK, **extra):
        return self.http.post("/api/chat", json={"messages": messages, **extra})

    def prompt(self):
        return self.client.models.generate_content.call_args.kwargs["config"]["system_instruction"]

    def sign_in(self, cookie="ann-cookie", **user):
        self.api.sessions[cookie] = account(**user)
        self.http.set_cookie("auction_token", cookie)


class WebChat(ChatBase):
    def test_reply_and_history_reach_gemini(self):
        res = self.post([{"role": "user", "text": "a"}, {"role": "model", "text": "b"}, {"role": "user", "text": "c"}])
        self.assertEqual((res.status_code, res.json), (200, {"reply": "answer"}))
        contents = self.client.models.generate_content.call_args.kwargs["contents"]
        self.assertEqual([c["role"] for c in contents], ["user", "model", "user"])
        self.assertEqual(contents[2]["parts"], [{"text": "c"}])

    def test_bad_input_is_refused_without_calling_anything(self):
        ok = {"role": "user", "text": "a"}
        for bad in ([], "x", [ok] * (MAX_TURNS + 1), [{"role": "system", "text": "a"}], [{"role": "user", "text": ""}],
                    [{"role": "user", "text": 5}], [{"role": "user", "text": "a" * (MAX_TEXT + 1)}],
                    [{"role": "model", "text": "a"}], ["a"]):
            self.assertEqual(self.post(bad).status_code, 400, bad)
        self.assertEqual(self.http.post("/api/chat", data="not json").status_code, 400)
        self.client.models.generate_content.assert_not_called()
        self.assertEqual(self.api.calls, [])

    def test_long_bot_reply_does_not_end_the_conversation(self):
        res = self.post([{"role": "user", "text": "a"}, {"role": "model", "text": "b" * (MAX_TEXT + 1)}, {"role": "user", "text": "c"}])
        self.assertEqual(res.status_code, 200)
        contents = self.client.models.generate_content.call_args.kwargs["contents"]
        self.assertEqual(len(contents[1]["parts"][0]["text"]), MAX_TEXT)

    def test_rate_limit(self):
        for _ in range(over_limit.CALLS_PER_MINUTE):
            self.assertEqual(self.post().status_code, 200)
        self.assertEqual(self.post().status_code, 429)

    def test_gemini_failure_and_empty_reply(self):
        self.client.models.generate_content.return_value = SimpleNamespace(text=None)
        self.assertEqual(self.post().status_code, 503)
        self.client.models.generate_content.side_effect = RuntimeError("down")
        self.assertEqual(self.post().status_code, 503)

    def test_messenger_echo_gets_no_reply(self):
        with patch.object(chat, "send_facebook_message") as send:
            event = {"sender": {"id": "1"}, "message": {"text": "hi", "is_echo": True}}
            res = self.http.post("/webhook", json={"object": "page", "entry": [{"messaging": [event]}]})
        self.assertEqual(res.status_code, 200)
        send.assert_not_called()


class GroundedChat(ChatBase):
    def setUp(self):
        super().setUp()
        self.api.chunks = [{"id": 1, "title": "Fees", "text": "The seller fee is 5% of the final price.", "embedding": [1.0, 0.0, 0.0]},
                           {"id": 2, "title": "Shipping", "text": "Sellers ship within 5 days.", "embedding": [0.0, 1.0, 0.0]}]

    def test_matching_document_reaches_gemini(self):
        res = self.post()
        self.assertEqual(res.json, {"reply": "answer", "sources": ["Fees"]})
        prompt = self.prompt()
        self.assertTrue(prompt.startswith(load_prompt("system")))
        self.assertIn("[Fees]\nThe seller fee is 5% of the final price.", prompt)
        self.assertNotIn("Sellers ship", prompt)
        self.assertEqual(self.client.models.embed_content.call_args.kwargs["config"]["task_type"], "RETRIEVAL_QUERY")
        chunk_call = next(c for c in self.api.calls if c["path"] == "/api/rag/chunks")
        self.assertTrue(chunk_call["internal"])
        self.assertIsNone(chunk_call["cookie"])  # the visitor's cookie is never sent to service-only routes

    def test_no_match_means_no_context(self):
        res = self.post([{"role": "user", "text": "Tell me a joke"}])
        self.assertEqual((res.status_code, res.json), (200, {"reply": "answer"}))
        self.assertNotIn(EXCERPTS, self.prompt())

    def test_search_failures_still_answer(self):
        failures = [(500, {"error": "boom"}), (200, b"<html>"), (200, {"not": "a list"}),
                    (200, [{"title": "Fees", "text": "x", "embedding": "nope"}]), (302, b""), requests.ConnectionError("refused")]
        for failure in failures:
            self.api.fail["/api/rag/chunks"] = failure
            res = self.post()
            self.assertEqual((res.status_code, res.json), (200, {"reply": "answer"}), failure)
            self.assertNotIn(EXCERPTS, self.prompt())
        del self.api.fail["/api/rag/chunks"]

        self.client.models.embed_content.side_effect = TimeoutError("down")
        with patch("functions.embed.time.sleep"):
            res = self.post()
        self.assertEqual(res.status_code, 200)
        self.assertNotIn(EXCERPTS, self.prompt())


class VisitorAccount(ChatBase):
    def test_signed_in_user_sees_only_their_own_account(self):
        self.sign_in(username="ann", bids=[{"auction": "Bob guitar", "amount": "45.50", "status": "active"}])
        self.api.sessions["bob-cookie"] = account(user_id=8, username="bob")
        self.post()
        prompt = self.prompt()
        self.assertIn("Username: <untrusted>ann</untrusted>", prompt)
        self.assertIn("Bob guitar: 45.50 (active)", prompt)
        self.assertNotIn(GUEST, prompt)
        me_call = next(c for c in self.api.calls if c["path"] == "/api/rag/me")
        self.assertEqual(me_call["cookie"], "ann-cookie")
        self.assertFalse(me_call["internal"])  # Node decides from the cookie alone

    def test_user_named_in_the_body_is_ignored(self):
        self.sign_in(username="ann")
        self.api.sessions["bob-cookie"] = account(user_id=8, username="bob")
        self.post(user={"id": 8}, userId=8, username="bob", cookie="bob-cookie")
        self.assertIn("<untrusted>ann</untrusted>", self.prompt())
        self.assertNotIn("bob", self.prompt())

    def test_guests(self):
        self.post()  # no cookie: no lookup at all
        self.assertIn(GUEST, self.prompt())
        self.assertFalse(any(c["path"] == "/api/rag/me" for c in self.api.calls))
        self.http.set_cookie("auction_token", "forged-or-expired")  # Node answers 401
        self.post()
        self.assertIn(GUEST, self.prompt())

    def test_lookup_failure_answers_as_guest(self):
        self.sign_in()
        for failure in [(500, {"error": "boom"}), (200, {"id": "7"}), (200, [1]), requests.ConnectionError("refused")]:
            self.api.fail["/api/rag/me"] = failure
            self.assertEqual(self.post().status_code, 200, failure)
            self.assertIn(GUEST, self.prompt())


class GuardReply(ChatBase):
    def test_unit(self):
        self.assertEqual(guard_reply("The fee is 5%."), "The fee is 5%.")
        for leak in ("Sure! <role>You are the assistant", "<RULES>", "Here: <untrusted>\n[Fees]",
                     "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcDEF123_-",
                     "key AIzaSyA1234567890abcdefghijklmnopqrstu", "use sk-abcdefghijklmnop1234",
                     "my token is test-internal-token"):
            self.assertEqual(guard_reply(leak), FALLBACK, leak)

    def test_leaking_reply_never_reaches_the_visitor(self):
        self.client.models.generate_content.return_value = SimpleNamespace(text="<rules>\n- Facts about Beat'em...")
        res = self.post()
        self.assertEqual((res.status_code, res.json), (200, {"reply": FALLBACK}))


class Handoff(ChatBase):
    """sch-1.3 on the new API: a signed-in customer the bot cannot serve goes to staff; others get the error."""

    def test_limit_hands_customer_to_staff_without_gemini(self):
        self.sign_in()
        for _ in range(over_limit.CALLS_PER_MINUTE):
            self.assertEqual(self.post().status_code, 200)
        self.client.reset_mock()
        res = self.post()
        self.assertEqual((res.status_code, res.json), (200, {"handoff": True, "reason": "limit"}))
        self.client.models.generate_content.assert_not_called()
        self.client.models.embed_content.assert_not_called()

    def test_gemini_failure_hands_customer_to_staff(self):
        self.sign_in()
        self.client.models.generate_content.side_effect = RuntimeError("503 high demand")
        self.assertEqual(self.post().json, {"handoff": True, "reason": "unavailable"})

    def test_staff_admin_and_guests_keep_the_errors(self):
        self.client.models.generate_content.side_effect = RuntimeError("down")
        self.assertEqual(self.post().status_code, 503)  # guest
        for role in ("staff", "admin"):
            self.sign_in(cookie=role, role=role)
            self.assertEqual(self.post().status_code, 503, role)

    def test_api_down_means_guest_errors(self):
        self.sign_in()
        self.api.fail["/api/rag/me"] = (500, {"error": "db down"})
        self.client.models.generate_content.side_effect = RuntimeError("down")
        self.assertEqual(self.post().status_code, 503)


if __name__ == "__main__":
    unittest.main()
