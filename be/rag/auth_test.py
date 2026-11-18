"""Unit tests for RAG Authentication & Authorization module (be/rag/auth.py).

Verifies:
1. Token extraction via `auction_token` cookie and `Authorization: Bearer <token>` header.
2. 401 Unauthorized for missing, expired, forged, or locked user tokens.
3. 403 Forbidden for insufficient role (e.g. customer accessing /api/docs).
4. Role permissions across routes:
   - /api/chat permits customer, staff, admin.
   - /api/rag/retrieve permits customer, staff, admin.
   - /api/docs permits staff, admin only.
"""

import json
import os
import sys
import time
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(__file__))

os.environ.setdefault("DATABASE_URL", os.getenv("RAG_TEST_DATABASE_URL", "postgresql://auction:auction@localhost:5436/auction_test"))
import auth
import chat
import rag
from rag_docs_test import token


class RagAuthUnitTest(unittest.TestCase):
    def setUp(self):
        self.app = chat.app
        self.client = self.app.test_client()

    def test_extract_token_from_cookie(self):
        with self.app.test_request_context(headers={"Cookie": f"{rag.COOKIE}=test-cookie-token"}):
            self.assertEqual(auth.extract_token(), "test-cookie-token")

    def test_extract_token_from_bearer_header(self):
        with self.app.test_request_context(headers={"Authorization": "Bearer test-bearer-token"}):
            self.assertEqual(auth.extract_token(), "test-bearer-token")

    def test_extract_token_prefers_cookie_or_header(self):
        with self.app.test_request_context(
            headers={"Cookie": f"{rag.COOKIE}=cookie-tok", "Authorization": "Bearer header-tok"}
        ):
            self.assertEqual(auth.extract_token(), "cookie-tok")

    def test_extract_token_none_when_missing(self):
        with self.app.test_request_context():
            self.assertIsNone(auth.extract_token())

    def test_authenticate_user_missing_token(self):
        with self.app.test_request_context():
            user, denied = auth.authenticate_user(None)
            self.assertIsNone(user)
            self.assertEqual(denied[1], 401)
            self.assertEqual(denied[0].json, {"error": "Authentication required"})

    def test_authenticate_user_invalid_or_blocked(self):
        mock_conn = MagicMock()
        with patch.object(rag, "session_user", return_value=None):
            with self.app.test_request_context(headers={"Authorization": "Bearer invalid"}):
                user, denied = auth.authenticate_user(mock_conn)
                self.assertIsNone(user)
                self.assertEqual(denied[1], 401)
                self.assertEqual(denied[0].json, {"error": "Authentication required"})

    def test_check_permission_allowed_roles(self):
        mock_conn = MagicMock()
        with patch.object(rag, "session_user", return_value={"id": 1, "role": "customer"}):
            with self.app.test_request_context(headers={"Authorization": "Bearer valid"}):
                # Allowed role
                user, denied = auth.check_permission(mock_conn, auth.ALLOWED_CHAT_ROLES)
                self.assertEqual(user, {"id": 1, "role": "customer"})
                self.assertIsNone(denied)

                # Forbidden role
                user, denied = auth.check_permission(mock_conn, auth.ALLOWED_DOCS_ROLES)
                self.assertIsNone(user)
                self.assertEqual(denied[1], 403)
                self.assertEqual(denied[0].json, {"error": "Forbidden"})

    def test_route_auth_chat_unauthenticated(self):
        res = self.client.post("/api/chat", json={"messages": [{"role": "user", "text": "hello"}]})
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.json, {"error": "Authentication required"})

    def test_route_auth_chat_bearer_header(self):
        valid_tok = token(100)
        with patch.object(chat.rag, "connect", return_value=MagicMock()):
            with patch.object(chat.rag, "session_user", return_value={"id": 100, "role": "customer"}):
                with patch.object(chat.rag, "user_context", return_value="context"):
                    with patch.object(chat.rag, "retrieve", return_value=[]):
                        with patch.object(chat.client.models, "generate_content", return_value=SimpleNamespace(text="hi")):
                            res = self.client.post(
                                "/api/chat",
                                headers={"Authorization": f"Bearer {valid_tok}"},
                                json={"messages": [{"role": "user", "text": "hello"}]},
                            )
                            self.assertEqual(res.status_code, 200)

    def test_route_auth_retrieve_unauthenticated(self):
        res = self.client.post("/api/rag/retrieve", json={"query": "test query"})
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.json, {"error": "Authentication required"})

    def test_route_auth_retrieve_bearer_header(self):
        valid_tok = token(100)
        with patch.object(chat.rag, "connect", return_value=MagicMock()):
            with patch.object(chat.rag, "session_user", return_value={"id": 100, "role": "customer"}):
                with patch.object(chat.rag, "embed", return_value=[[1.0, 0.0]]):
                    with patch.object(chat.rag, "retrieve", return_value=[(0.9, "Doc1", "Excerpt1")]):
                        res = self.client.post(
                            "/api/rag/retrieve",
                            headers={"Authorization": f"Bearer {valid_tok}"},
                            json={"query": "test query"},
                        )
                        self.assertEqual(res.status_code, 200)
                        self.assertEqual(res.json["results"][0]["title"], "Doc1")

    def test_route_docs_forbidden_for_customer(self):
        cust_tok = token(200)
        with patch.object(chat.rag, "connect", return_value=MagicMock()):
            with patch.object(chat.rag, "session_user", return_value={"id": 200, "role": "customer"}):
                res = self.client.get("/api/docs", headers={"Authorization": f"Bearer {cust_tok}"})
                self.assertEqual(res.status_code, 403)
                self.assertEqual(res.json, {"error": "Forbidden"})

                res = self.client.get("/api/docs/1", headers={"Authorization": f"Bearer {cust_tok}"})
                self.assertEqual(res.status_code, 403)
                self.assertEqual(res.json, {"error": "Forbidden"})

                res = self.client.delete("/api/docs/1", headers={"Authorization": f"Bearer {cust_tok}"})
                self.assertEqual(res.status_code, 403)
                self.assertEqual(res.json, {"error": "Forbidden"})

    def test_route_docs_allowed_for_staff_and_admin(self):
        for role in ("staff", "admin"):
            t = token(300)
            with patch.object(chat.rag, "connect", return_value=MagicMock()):
                with patch.object(chat.rag, "session_user", return_value={"id": 300, "role": role}):
                    with patch.object(chat.rag, "list_documents", return_value=[]):
                        res = self.client.get("/api/docs", headers={"Authorization": f"Bearer {t}"})
                        self.assertEqual(res.status_code, 200)


if __name__ == "__main__":
    unittest.main()
