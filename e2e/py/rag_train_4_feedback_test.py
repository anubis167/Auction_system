"""rag-train-4: POST /api/chat/feedback relays the chat box's thumbs to PUT /api/rag/turns/<id>/feedback.
Run: npm run test:py"""
import unittest

from fake_api import FakeApi

import chat  # noqa: E402  (fake_api put be/rag on sys.path)

VISITOR = "v" * 40


class Feedback(unittest.TestCase):
    def setUp(self):
        self.api = FakeApi().start(self)
        self.http = chat.app.test_client()

    def post(self, **body):
        return self.http.post("/api/chat/feedback", json={"turnId": 3, "feedback": "down", "visitor": VISITOR, **body})

    def test_relays_to_the_api_with_the_service_token(self):
        self.api.fail["/api/rag/turns/3/feedback"] = (200, {"turnId": 3, "feedback": "down"})
        res = self.post()
        self.assertEqual((res.status_code, res.json), (200, {"turnId": 3, "feedback": "down"}))
        [call] = self.api.calls
        self.assertEqual((call["method"], call["path"], call["internal"]), ("PUT", "/api/rag/turns/3/feedback", True))
        self.assertEqual(call["json"], {"visitor": VISITOR, "feedback": "down"})

    def test_bad_input_never_reaches_the_api(self):
        for bad in ({"turnId": "3"}, {"turnId": 0}, {"turnId": True}, {"feedback": "meh"}, {"visitor": None}):
            self.assertEqual(self.post(**bad).status_code, 400, bad)
        self.assertEqual(self.http.post("/api/chat/feedback", data="x").status_code, 400)
        self.assertEqual(self.api.calls, [])

    def test_api_refusals_are_passed_on(self):
        for status, error in ((403, "Not your conversation"), (404, "Turn not found")):
            self.api.fail["/api/rag/turns"] = (status, {"error": error})
            res = self.post()
            self.assertEqual((res.status_code, res.json), (status, {"error": error}))
        self.api.fail["/api/rag/turns"] = (500, {"error": "boom"})
        with self.assertLogs(chat.app.logger, "ERROR"):
            self.assertEqual(self.post().status_code, 502)


if __name__ == "__main__":
    unittest.main()
