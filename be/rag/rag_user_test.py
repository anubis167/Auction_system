"""rag-1.7 integration: /api/chat knows only the signed-in visitor's own account (auction_test, Gemini stubbed).
Run: python be/rag/rag_user_test.py"""
import os
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import psycopg

os.environ["DATABASE_URL"] = os.getenv("RAG_TEST_DATABASE_URL", "postgresql://auction:auction@localhost:5436/auction_test")
import chat  # noqa: E402
import rag  # noqa: E402
from rag_docs_test import token  # noqa: E402

PREFIX = "raguser_"
GUEST = rag.GUEST_CONTEXT.strip()


class SignedInChat(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            cls.db = psycopg.connect(os.environ["DATABASE_URL"], connect_timeout=3, autocommit=True)
        except psycopg.OperationalError as e:
            raise unittest.SkipTest(f"Postgres not reachable: {e}")
        cls.cleanup()
        user = ("INSERT INTO users (email, username, password_hash, role, status, credit_balance, held_balance, updated_at) "
                "VALUES (%s, %s, 'x', 'customer', %s, %s, %s, now()) RETURNING id")
        cls.ann = cls.db.execute(user, (f"{PREFIX}ann@t.l", f"{PREFIX}ann", "active", "150.00", "20.00")).fetchone()[0]
        cls.bob = cls.db.execute(user, (f"{PREFIX}bob@t.l", f"{PREFIX}bob", "active", "999.00", "0")).fetchone()[0]
        cls.locked = cls.db.execute(user, (f"{PREFIX}locked@t.l", f"{PREFIX}locked", "locked", "77.00", "0")).fetchone()[0]
        ann_lot = cls.lot(cls.ann, "Ann vintage camera", "active", "+2 days")
        cls.lot(cls.ann, "Ann finished lamp", "ended", "-1 day")
        bob_lot = cls.lot(cls.bob, "Bob guitar", "active", "+3 days")
        cls.db.execute("INSERT INTO bid_tickets (auction_id, bidder_id, amount) VALUES (%s, %s, 45.50)", (bob_lot, cls.ann))
        cls.db.execute("INSERT INTO bid_tickets (auction_id, bidder_id, amount) VALUES (%s, %s, 812.00)", (ann_lot, cls.bob))

    @classmethod
    def lot(cls, seller, name, status, ends):
        goods = cls.db.execute("INSERT INTO goods (seller_id, name, updated_at) VALUES (%s, %s, now()) RETURNING id",
                               (seller, name)).fetchone()[0]
        return cls.db.execute(
            "INSERT INTO auctions (seller_id, goods_id, name, initial_price, duration_minutes, start_time, end_time, status, updated_at) "
            "VALUES (%s, %s, %s, 10, 60, now() - interval '1 day', now() + %s::interval, %s, now()) RETURNING id",
            (seller, goods, name, ends, status)).fetchone()[0]

    @classmethod
    def cleanup(cls):  # test data only
        users = "SELECT id FROM users WHERE username LIKE 'raguser\\_%'"
        cls.db.execute(f"DELETE FROM bid_tickets WHERE bidder_id IN ({users})")
        cls.db.execute(f"DELETE FROM bid_tickets WHERE auction_id IN (SELECT id FROM auctions WHERE seller_id IN ({users}))")
        cls.db.execute(f"DELETE FROM auctions WHERE seller_id IN ({users})")
        cls.db.execute(f"DELETE FROM goods WHERE seller_id IN ({users})")
        cls.db.execute(f"DELETE FROM users WHERE id IN ({users})")

    @classmethod
    def tearDownClass(cls):
        cls.cleanup()
        cls.db.close()

    def setUp(self):
        chat.web_calls.clear()
        self.client = patch.object(chat, "client", MagicMock()).start()
        self.addCleanup(patch.stopall)
        self.client.models.embed_content.side_effect = lambda model, contents, config: SimpleNamespace(
            embeddings=[SimpleNamespace(values=[0.0, 1.0]) for _ in contents])
        self.client.models.generate_content.return_value = SimpleNamespace(text="answer")
        self.http = chat.app.test_client()

    def ask(self, cookie=None, **body):
        if cookie is not None:
            self.http.set_cookie(rag.COOKIE, cookie)
        res = self.http.post("/api/chat", json={"messages": [{"role": "user", "text": "What is my balance?"}], **body})
        self.assertEqual((res.status_code, res.json), (200, {"reply": "answer"}))
        return self.client.models.generate_content.call_args.kwargs["config"]["system_instruction"]

    def assert_guest(self, prompt):
        self.assertIn(GUEST, prompt)
        for secret in ("150.00", "999.00", "77.00", "Ann vintage camera", "Bob guitar", "raguser_"):
            self.assertNotIn(secret, prompt)

    def test_signed_in_user_sees_only_their_own_account(self):
        prompt = self.ask(token(self.ann))
        self.assertIn("logged in as raguser_ann", prompt)
        self.assertIn("balance 150.00, held for bids 20.00, available 130.00", prompt)
        self.assertIn("Bob guitar: 45.50 (active)", prompt)  # Ann's own bid, on Bob's lot
        self.assertIn("Ann vintage camera: active", prompt)  # Ann's open lot
        self.assertNotIn("Ann finished lamp", prompt)  # ended lots are not open
        self.assertNotIn("999.00", prompt)  # Bob's credit
        self.assertNotIn("812.00", prompt)  # Bob's bid, even though it is on Ann's lot
        self.assertNotIn(GUEST, prompt)

    def test_user_named_in_the_body_is_ignored(self):
        prompt = self.ask(token(self.ann), user={"id": str(self.bob)}, userId=str(self.bob), username="raguser_bob")
        self.assertIn("logged in as raguser_ann", prompt)
        self.assertNotIn("999.00", prompt)
        self.assert_guest(self.ask("", userId=str(self.ann), username="raguser_ann"))

    def test_guests(self):
        self.assert_guest(self.ask())  # no cookie
        self.assert_guest(self.ask(token(self.ann, secret="forged")))
        self.assert_guest(self.ask(token(self.ann, exp_in=-5)))
        self.assert_guest(self.ask(token(self.locked)))

    def test_lookup_failure_answers_as_guest(self):
        with patch.object(rag, "user_context", side_effect=psycopg.OperationalError("db down")):
            self.assert_guest(self.ask(token(self.ann)))
        with patch.object(rag, "connect", side_effect=psycopg.OperationalError("db down")):
            self.assert_guest(self.ask(token(self.ann)))

    def test_prompt_no_longer_claims_unseen_data(self):
        self.assertIn("Never state account", chat.WEB_PROMPT)
        self.assertNotIn("Check the login status", chat.WEB_PROMPT)


if __name__ == "__main__":
    unittest.main()
