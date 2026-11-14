"""rag-1.1 integration: knowledge tables in the real Postgres. Run: python be/rag_db_test.py (needs docker compose db, migrated)."""
import os
import unittest

import psycopg

DB_URL = os.getenv("RAG_TEST_DATABASE_URL", "postgresql://auction:auction@localhost:5436/auction_test")


def connect():
    try:
        return psycopg.connect(DB_URL, connect_timeout=3)
    except psycopg.OperationalError as e:
        raise unittest.SkipTest(f"Postgres not reachable at {DB_URL}: {e}")


class KnowledgeTables(unittest.TestCase):
    def setUp(self):
        self.conn = connect()  # rolled back in tearDown, so the db is left as found

    def tearDown(self):
        self.conn.rollback()
        self.conn.close()

    def test_document_chunks_and_soft_delete(self):
        cur = self.conn.cursor()
        cur.execute(
            "INSERT INTO users (email, username, password_hash, role, updated_at) "
            "VALUES ('rag-db@test.local', 'rag_db_test', 'x', 'staff', now()) RETURNING id"
        )
        user_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO knowledge_documents (title, filename, mime_type, content, size_bytes, uploaded_by_id) "
            "VALUES ('Fees', 'fees.md', 'text/markdown', 'a b', 3, %s) RETURNING id",
            (user_id,),
        )
        doc_id = cur.fetchone()[0]
        cur.executemany(
            "INSERT INTO knowledge_chunks (document_id, position, text, embedding) VALUES (%s, %s, %s, %s)",
            [(doc_id, 0, "a", [0.1, 0.2]), (doc_id, 1, "b", [0.3, 0.4])],
        )
        cur.execute("SELECT position, text, embedding FROM knowledge_chunks WHERE document_id = %s ORDER BY position", (doc_id,))
        self.assertEqual(cur.fetchall(), [(0, "a", [0.1, 0.2]), (1, "b", [0.3, 0.4])])

        with self.assertRaises(psycopg.errors.UniqueViolation):
            with self.conn.transaction():
                cur.execute("INSERT INTO knowledge_chunks (document_id, position, text) VALUES (%s, 0, 'dup')", (doc_id,))

        cur.execute("UPDATE knowledge_documents SET deleted_at = now() WHERE id = %s", (doc_id,))
        cur.execute("SELECT deleted_at IS NOT NULL, (SELECT count(*) FROM knowledge_chunks WHERE document_id = %s) "
                    "FROM knowledge_documents WHERE id = %s", (doc_id, doc_id))
        self.assertEqual(cur.fetchone(), (True, 2))  # soft delete: row and chunks stay


if __name__ == "__main__":
    unittest.main()
