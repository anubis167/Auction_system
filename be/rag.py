"""Round 12: RAG helpers for the chat box in chat.py (chunking, embeddings, retrieval)."""
import base64
import hashlib
import hmac
import json
import os
import re
import time

import psycopg
from google.genai import errors

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
    """rag-1.2: chunks of at most `size` chars; each starts with the last `overlap` chars of the one before."""
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


EMBED_MODEL = "gemini-embedding-001"
EMBED_BATCH = 100
EMBED_TRIES = 3
EMBED_DIMENSIONS = 768  # 4x smaller than the 3072 default; ranking uses cosine, so the vectors need no normalising


class EmbedError(Exception):
    """Embedding failed after every retry."""


def _retryable(error):
    # 4xx (bad request, bad key) will fail the same way again; 429, 5xx, timeouts and network errors may not
    return not isinstance(error, errors.APIError) or error.code == 429 or error.code >= 500


def embed(client, texts, task):
    """rag-1.3: one vector per text, in order. task: RETRIEVAL_DOCUMENT (indexing) or RETRIEVAL_QUERY (questions).
    Retries on top of the SDK's own retries in chat.py, which only cover a single HTTP call."""
    vectors = []
    for start in range(0, len(texts), EMBED_BATCH):
        batch = texts[start:start + EMBED_BATCH]
        for attempt in range(EMBED_TRIES):
            try:
                response = client.models.embed_content(model=EMBED_MODEL, contents=batch, config={"task_type": task, "output_dimensionality": EMBED_DIMENSIONS})
                break
            except Exception as e:
                if not _retryable(e) or attempt == EMBED_TRIES - 1:
                    raise EmbedError(f"Embedding failed: {e}") from e
                time.sleep(min(2 ** attempt, 4))
        vectors.extend(list(item.values) for item in response.embeddings)
    if len(vectors) != len(texts):
        raise EmbedError(f"Embedding returned {len(vectors)} vectors for {len(texts)} texts")
    return vectors


# rag-1.4: the Node API's session cookie (be/src/config.ts cookieName) and the statuses it locks out (BLOCKED_STATUSES)
COOKIE = "auction_token"
BLOCKED_STATUSES = ("locked", "disabled", "deleted")


def connect():
    """shortcut: one connection per request, no pool; add psycopg_pool if chat traffic grows."""
    return psycopg.connect(os.environ["DATABASE_URL"], connect_timeout=5)


def _b64(part):
    return base64.urlsafe_b64decode(part + "=" * (-len(part) % 4))


def read_token(token):
    """Same check as readUser in be/src/middleware/auth.ts: HS256 signed with JWT_SECRET and not expired. User id or None."""
    try:
        header, payload, signature = token.split(".")
        if json.loads(_b64(header)).get("alg") != "HS256":
            return None
        secret = os.getenv("JWT_SECRET", "dev-secret").encode()  # same fallback as be/src/config.ts
        expected = hmac.new(secret, f"{header}.{payload}".encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _b64(signature)):
            return None
        claims = json.loads(_b64(payload))
        if not isinstance(claims.get("exp"), (int, float)) or claims["exp"] <= time.time():
            return None
        return int(claims["sub"])
    except (ValueError, TypeError, KeyError, AttributeError):
        return None


def session_user(conn, token):
    """The signed-in user as {id, role}, re-read from the db like loadSessionUser; None = guest."""
    user_id = read_token(token) if token else None
    if user_id is None:
        return None
    row = conn.execute("SELECT id, role, status FROM users WHERE id = %s", (user_id,)).fetchone()
    if not row or row[2] in BLOCKED_STATUSES:
        return None
    return {"id": row[0], "role": row[1]}


def save_document(conn, user_id, title, filename, mime_type, content, chunks, vectors):
    """Document and all its chunks in one transaction, so a failure leaves nothing half-indexed."""
    with conn.transaction():
        doc_id = conn.execute(
            "INSERT INTO knowledge_documents (title, filename, mime_type, content, size_bytes, uploaded_by_id) "
            "VALUES (%s, %s, %s, %s, %s, %s) RETURNING id",
            (title, filename, mime_type, content, len(content.encode()), user_id),
        ).fetchone()[0]
        conn.cursor().executemany(
            "INSERT INTO knowledge_chunks (document_id, position, text, embedding) VALUES (%s, %s, %s, %s)",
            [(doc_id, i, text, vector) for i, (text, vector) in enumerate(zip(chunks, vectors))],
        )
    return doc_id


def list_documents(conn):
    rows = conn.execute(
        "SELECT d.id, d.title, d.filename, d.size_bytes, d.created_at, count(c.id) FROM knowledge_documents d "
        "LEFT JOIN knowledge_chunks c ON c.document_id = d.id WHERE d.deleted_at IS NULL "
        "GROUP BY d.id ORDER BY d.created_at DESC, d.id DESC"
    ).fetchall()
    return [{"id": r[0], "title": r[1], "filename": r[2], "sizeBytes": r[3], "createdAt": r[4].isoformat() + "Z", "chunks": r[5]}
            for r in rows]


def delete_document(conn, doc_id):
    """Soft delete (SRS: all delete means soft delete). False when there is no live document with this id."""
    return conn.execute(
        "UPDATE knowledge_documents SET deleted_at = now() WHERE id = %s AND deleted_at IS NULL", (doc_id,)
    ).rowcount == 1
