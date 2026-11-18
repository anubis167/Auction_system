"""Round 12: RAG helpers for the chat box in chat.py (chunking, embeddings, retrieval)."""
import base64
import hashlib
import hmac
import json
import math
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


def get_document(conn, doc_id):
    """Document details and chunk list by ID. None if not found or soft-deleted."""
    row = conn.execute(
        "SELECT id, title, filename, mime_type, size_bytes, uploaded_by_id, created_at, content "
        "FROM knowledge_documents WHERE id = %s AND deleted_at IS NULL",
        (doc_id,),
    ).fetchone()
    if not row:
        return None
    chunk_rows = conn.execute(
        "SELECT id, position, text FROM knowledge_chunks WHERE document_id = %s ORDER BY position ASC",
        (doc_id,),
    ).fetchall()
    chunks = [{"id": c[0], "position": c[1], "text": c[2]} for c in chunk_rows]
    created_at = row[6].isoformat() + "Z" if hasattr(row[6], "isoformat") else str(row[6])
    return {
        "id": row[0],
        "title": row[1],
        "filename": row[2],
        "mimeType": row[3],
        "sizeBytes": row[4],
        "uploadedById": row[5],
        "createdAt": created_at,
        "content": row[7],
        "chunks": chunks,
    }


def delete_document(conn, doc_id):
    """Soft delete (SRS: all delete means soft delete). False when there is no live document with this id."""
    return conn.execute(
        "UPDATE knowledge_documents SET deleted_at = now() WHERE id = %s AND deleted_at IS NULL", (doc_id,)
    ).rowcount == 1


# rag-1.5: retrieval. MIN_SCORE from a live check (2026-11-14, gemini-embedding-001 at 768 dims):
# matching questions scored 0.68-0.77, small talk and off-topic questions 0.47-0.57.
TOP_K = 4
MIN_SCORE = 0.6


def cosine(a, b):
    norm = math.sqrt(sum(x * x for x in a) * sum(y * y for y in b))
    return sum(x * y for x, y in zip(a, b)) / norm if norm else 0.0


def rank(rows, query_vector, k=TOP_K, min_score=MIN_SCORE):
    """rows: (title, text, embedding). The k best at or above min_score, best first, as (score, title, text)."""
    scored = [(cosine(query_vector, embedding), title, text) for title, text, embedding in rows if embedding]
    return sorted((hit for hit in scored if hit[0] >= min_score), key=lambda hit: hit[0], reverse=True)[:k]


def retrieve(conn, query_vector):
    """shortcut: scores every live chunk in Python on each question; move to pgvector past a few thousand chunks."""
    rows = conn.execute(
        "SELECT d.title, c.text, c.embedding FROM knowledge_chunks c "
        "JOIN knowledge_documents d ON d.id = c.document_id WHERE d.deleted_at IS NULL"
    ).fetchall()
    return rank(rows, query_vector)


def context_block(hits):
    """Text added to the system prompt; empty when nothing relevant was found."""
    if not hits:
        return ""
    excerpts = "\n\n".join(f"[{title}]\n{text}" for _, title, text in hits)
    return ("\n\nExcerpts from Beat'em's own documents that may answer the question. Use them when they are relevant, "
            "and do not state facts about Beat'em that they or this prompt do not give you.\n\n" + excerpts)


# rag-1.7: what the bot may know about the visitor. The user only ever comes from the verified session cookie.
GUEST_CONTEXT = ("\n\nThe visitor is not logged in. If they ask about their account, bids, credit or lots, "
                 "tell them to log in first on the login page (/login).")


def user_context(conn, user_id):
    """The signed-in visitor's own credit, latest bids and open lots, as text for the system prompt."""
    username, balance, held = conn.execute(
        "SELECT username, credit_balance, held_balance FROM users WHERE id = %s", (user_id,)).fetchone()
    bids = conn.execute(
        "SELECT a.name, b.amount, b.status FROM bid_tickets b JOIN auctions a ON a.id = b.auction_id "
        "WHERE b.bidder_id = %s AND a.deleted_at IS NULL ORDER BY b.created_at DESC, b.id DESC LIMIT 5", (user_id,)).fetchall()
    lots = conn.execute(
        "SELECT name, status, coalesce(current_price, initial_price), end_time FROM auctions "
        "WHERE seller_id = %s AND deleted_at IS NULL AND status IN ('upcoming', 'active') AND end_time > now() "
        "ORDER BY end_time LIMIT 5", (user_id,)).fetchall()
    lines = [
        f"\n\nThe visitor is logged in as {username}. Their own account, read from the database just now:",
        f"- Credit: balance {balance}, held for bids {held}, available {balance - held}",
        "- Latest bids: " + ("; ".join(f"{name}: {amount} ({status})" for name, amount, status in bids) or "none"),
        "- Their open lots: " + ("; ".join(f"{name}: {status}, price {price}, ends {end:%Y-%m-%d %H:%M} UTC"
                                            for name, status, price, end in lots) or "none"),
        "This is everything you know about their account; for anything else, point them to the matching page.",
    ]
    return "\n".join(lines)
