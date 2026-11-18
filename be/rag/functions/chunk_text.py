"""rag-1.2 / rag2-1.2: split a document into overlapping chunks for embedding."""
import re

CHUNK_SIZE = 1000
CHUNK_OVERLAP = 150


def _pieces(text, limit):
    """Paragraphs; a paragraph over the limit falls back to sentences, a sentence over it to hard cuts."""
    for para in re.split(r"\n\s*\n", text):
        para = para.strip()
        if len(para) <= limit:
            if para:
                yield para
            continue
        for sentence in re.split(r"(?<=[.!?])\s+", para):
            for i in range(0, len(sentence), limit):
                yield sentence[i:i + limit]


def chunk_text(text, size=CHUNK_SIZE, overlap=CHUNK_OVERLAP):
    """Chunks of at most `size` chars; each starts with the last `overlap` chars of the one before."""
    limit = size - overlap - 1  # room for the overlap and its newline
    bodies, current = [], ""
    for piece in _pieces(text, limit):
        if current and len(current) + 2 + len(piece) > limit:
            bodies.append(current)
            current = piece
        else:
            current = f"{current}\n\n{piece}" if current else piece
    if current:
        bodies.append(current)

    chunks = []
    for body in bodies:
        chunks.append(f"{chunks[-1][-overlap:]}\n{body}" if chunks else body)
    return chunks
