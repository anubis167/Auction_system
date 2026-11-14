"""rag-1.2 unit tests for chunk_text. Run: python be/rag/rag_chunk_test.py"""
import re
import unittest

from rag import CHUNK_OVERLAP, CHUNK_SIZE, chunk_text


def bodies(chunks):
    """Each chunk without the overlap it copied from the chunk before."""
    out = chunks[:1]
    for prev, chunk in zip(chunks, chunks[1:]):
        tail = prev[-CHUNK_OVERLAP:] + "\n"
        assert chunk.startswith(tail), "chunk does not start with the previous chunk's tail"
        out.append(chunk[len(tail):])
    return out


def solid(text):
    return re.sub(r"\s", "", text)


class ChunkText(unittest.TestCase):
    def check(self, text):
        chunks = chunk_text(text)
        self.assertTrue(all(len(c) <= CHUNK_SIZE for c in chunks), [len(c) for c in chunks])
        self.assertEqual(solid("".join(bodies(chunks))), solid(text))  # nothing lost, nothing added, order kept
        return chunks

    def test_short_text_is_one_chunk(self):
        self.assertEqual(self.check("  Fees are 5%.\n\nPay by card.  "), ["Fees are 5%.\n\nPay by card."])

    def test_empty_and_whitespace_give_no_chunks(self):
        for text in ("", "   ", "\n\n \n"):
            self.assertEqual(chunk_text(text), [])

    def test_many_paragraphs_split_on_paragraph_boundaries(self):
        paras = [f"Paragraph {i} " + "word " * 40 for i in range(30)]
        chunks = self.check("\n\n".join(paras))
        self.assertGreater(len(chunks), 3)
        for body in bodies(chunks):
            self.assertTrue(body.startswith("Paragraph "), body[:30])  # no paragraph cut in half

    def test_huge_paragraph_splits_on_sentences(self):
        text = " ".join(f"Sentence number {i} is here." for i in range(200))
        chunks = self.check(text)
        self.assertGreater(len(chunks), 3)
        for body in bodies(chunks):
            self.assertTrue(body.startswith("Sentence number"), body[:30])

    def test_sentence_without_breaks_is_hard_cut(self):
        self.check("x" * 5000)

    def test_neighbours_overlap(self):
        chunks = self.check("\n\n".join("p" * 400 for _ in range(6)))
        for prev, chunk in zip(chunks, chunks[1:]):
            self.assertEqual(chunk[:CHUNK_OVERLAP], prev[-CHUNK_OVERLAP:])


if __name__ == "__main__":
    unittest.main()
