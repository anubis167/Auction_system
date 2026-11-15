"""sch-1.1: proves e2e/py runs under `npm run test:py` and can import the chat code in be/rag."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "be", "rag"))
import rag  # noqa: E402


class LayoutTest(unittest.TestCase):
    def test_imports_rag(self):
        self.assertEqual(rag.chunk_text(""), [])


if __name__ == "__main__":
    unittest.main()
