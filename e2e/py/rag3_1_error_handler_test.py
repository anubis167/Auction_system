"""Unit tests for global error handling module (be/rag/error_handler.py)."""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "be", "rag"))

from flask import Flask, abort
from error_handler import register_error_handlers, STANDARD_MESSAGES


class ErrorHandlerTest(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.config["TESTING"] = True
        register_error_handlers(self.app)

        @self.app.route("/trigger/<int:code>")
        def trigger_error(code):
            abort(code)

        @self.app.route("/trigger-custom/<int:code>")
        def trigger_custom(code):
            abort(code, description="Custom detail message")

        @self.app.route("/trigger-500")
        def trigger_500():
            raise RuntimeError("Unexpected failure!")

        @self.app.route("/only-post", methods=["POST"])
        def only_post():
            return "ok"

        self.client = self.app.test_client()

    def test_standard_http_error_codes(self):
        for code in (400, 401, 403, 404, 413, 429):
            res = self.client.get(f"/trigger/{code}")
            self.assertEqual(res.status_code, code)
            self.assertEqual(res.content_type, "application/json")
            self.assertIn("error", res.json)
            self.assertEqual(res.json["error"], STANDARD_MESSAGES[code])

    def test_404_not_found_on_unknown_route(self):
        res = self.client.get("/non-existent-route-for-testing")
        self.assertEqual(res.status_code, 404)
        self.assertEqual(res.content_type, "application/json")
        self.assertEqual(res.json, {"error": "Not Found"})

    def test_405_method_not_allowed(self):
        res = self.client.get("/only-post")
        self.assertEqual(res.status_code, 405)
        self.assertEqual(res.content_type, "application/json")
        self.assertEqual(res.json, {"error": "Method Not Allowed"})

    def test_500_generic_exception(self):
        res = self.client.get("/trigger-500")
        self.assertEqual(res.status_code, 500)
        self.assertEqual(res.content_type, "application/json")
        self.assertEqual(res.json, {"error": "Internal server error"})

    def test_custom_error_description(self):
        res = self.client.get("/trigger-custom/400")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.content_type, "application/json")
        self.assertEqual(res.json, {"error": "Custom detail message"})


if __name__ == "__main__":
    unittest.main()
