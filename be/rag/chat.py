import os
import requests
from flask import Flask, request, jsonify
from dotenv import load_dotenv
from google import genai
import ngrok
import time
from collections import deque

import auth
import error_handler
import rag
import security

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
load_dotenv()

app = Flask(__name__)
# rag-2.1: room for one 10 MB document plus its multipart wrapping; bigger bodies get 413 before they are read
DOC_MAX_BYTES = 10 * 1024 * 1024
app.config["MAX_CONTENT_LENGTH"] = DOC_MAX_BYTES + 128 * 1024

# rag-3.1: Global error handlers for standard HTTP codes and unhandled exceptions
error_handler.register_error_handlers(app)

# rag-3.2: Security middleware blocking prompt ejection/injection across API endpoints
security.prompt_injection_middleware(app, paths=("/api/chat", "/api/docs", "/api/rag"))

if os.getenv("NGROK_AUTHTOKEN"):
    ngrok.set_auth_token(os.getenv("NGROK_AUTHTOKEN"))
# Initialize Gemini Client
# Gemini often answers 503 "high demand" for a few seconds, so the SDK retries; the timeout stops a hung call blocking the box
api_key = os.getenv("GEMINI_API_KEY")
client = genai.Client(
    api_key=api_key,
    http_options={"timeout": 30000, "retry_options": {"attempts": 4}},
) if api_key else None
# An alias, because Google retires pinned models (gemini-2.5-flash stopped working for this key)
GEMINI_MODEL = "gemini-flash-lite-latest"

# Credentials from Facebook Developer Console
PAGE_ACCESS_TOKEN = os.getenv("FACEBOOK_PAGE_ACCESS_TOKEN")
VERIFY_TOKEN = os.getenv("FACEBOOK_VERIFY_TOKEN", "my_secure_verify_token")

# chat-1.2: limits for the chat box embedded in the site (fe/src/components/ChatBox.tsx)
MAX_TURNS = 20
MAX_TEXT = 1000
WEB_CALLS_PER_MINUTE = 30
WEB_PROMPT = (
    "You are the assistant on Beat'em, an online auction site. Keep answers short and in plain text, without markdown. "
    "You only know the account details given below for the visitor you are talking to (rag-1.7). Never state account, "
    "bid, lot or credit details that are not given, and never discuss other customers."
)
web_calls = deque()

def over_web_limit():
    """shortcut: one in-memory limit shared by all visitors, use a per-user limit if real traffic hits it"""
    now = time.time()
    while web_calls and now - web_calls[0] > 60:
        web_calls.popleft()
    if len(web_calls) >= WEB_CALLS_PER_MINUTE:
        return True
    web_calls.append(now)
    return False

@app.route("/api/chat", methods=["POST"])
def web_chat():
    """Embedded site chat: authenticated user sends conversation, Gemini answers last message"""
    body = request.get_json(silent=True)
    messages = body.get("messages") if isinstance(body, dict) else None
    if not isinstance(messages, list) or not 1 <= len(messages) <= MAX_TURNS:
        return jsonify(error="Invalid messages"), 400

    contents = []
    for message in messages:
        role = message.get("role") if isinstance(message, dict) else None
        text = message.get("text") if isinstance(message, dict) else None
        if role not in ("user", "model") or not isinstance(text, str) or not text or (role == "user" and len(text) > MAX_TEXT):
            return jsonify(error="Invalid messages"), 400
        # The bot's own replies can pass MAX_TEXT and come back as history: trim them, refusing would end the conversation
        contents.append({"role": role, "parts": [{"text": text[:MAX_TEXT]}]})
    if contents[-1]["role"] != "user":
        return jsonify(error="Invalid messages"), 400

    if over_web_limit():
        return jsonify(error="Too many messages, please wait a minute"), 429

    token = auth.extract_token()
    if not token or not auth.read_claims(token):
        return jsonify(error="Authentication required"), 401

    account, hits = rag.GUEST_CONTEXT, []
    try:
        with rag.connect() as conn:
            user, denied = auth.check_permission(conn, auth.ALLOWED_CHAT_ROLES)
            if denied:
                return denied

            try:
                account = rag.user_context(conn, user["id"])
            except Exception:
                app.logger.exception("Account lookup failed, continuing without it")

            try:
                hits = rag.retrieve(conn, rag.embed(client, [contents[-1]["parts"][0]["text"]], "RETRIEVAL_QUERY")[0])
            except Exception:
                app.logger.exception("Document retrieval failed, answering without it")
    except Exception as e:
        claims = auth.read_claims(token)
        if not claims or claims.get("role") not in auth.ALLOWED_CHAT_ROLES:
            return jsonify(error="Authentication required"), 401
        app.logger.exception("Account or document lookup failed, answering without it: %s", e)

    try:
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=contents,
            config={"system_instruction": WEB_PROMPT + account + rag.context_block(hits)},
        )
        reply = response.text
    except Exception:
        app.logger.exception("Gemini call failed")
        reply = None
    if not reply:
        return jsonify(error="The assistant is unavailable right now"), 503
    if not hits:
        return jsonify(reply=reply)
    return jsonify(reply=reply, sources=list(dict.fromkeys(title for _, title, _ in hits)))

DOC_TYPES = {".txt": "text/plain", ".md": "text/markdown"}


def staff_only(conn):
    """rag-1.4 / rag-3.3: (user, None) for staff/admin via cookie or Bearer token, else (None, error response)."""
    return auth.check_permission(conn, auth.ALLOWED_DOCS_ROLES)


@app.route("/api/docs", methods=["POST"])
def upload_doc():
    """rag-1.4: store a .txt/.md document, its chunks and their embeddings for the chat box"""
    with rag.connect() as conn:
        user, denied = staff_only(conn)
        if denied:
            return denied
        file = request.files.get("file")
        filename = os.path.basename(file.filename or "") if file else ""
        ext = os.path.splitext(filename)[1].lower()
        if ext not in DOC_TYPES:
            return jsonify(error="Choose a .txt or .md file"), 400
        data = file.read(DOC_MAX_BYTES + 1)
        if len(data) > DOC_MAX_BYTES:
            return jsonify(error="The file is larger than 10 MB"), 413
        try:
            content = data.decode("utf-8-sig")
        except UnicodeDecodeError:
            return jsonify(error="The file must be UTF-8 text"), 400
        chunks = rag.chunk_text(content)
        if not chunks:
            return jsonify(error="The file is empty"), 400
        title = (request.form.get("title") or "").strip()[:255] or os.path.splitext(filename)[0][:255]

        try:
            vectors = rag.embed(client, chunks, "RETRIEVAL_DOCUMENT")
        except rag.EmbedError:
            app.logger.exception("Embedding the upload failed")
            return jsonify(error="The assistant is unavailable right now, try again later"), 503
        doc_id = rag.save_document(conn, user["id"], title, filename[:255], DOC_TYPES[ext], content, chunks, vectors)
    return jsonify(id=doc_id, title=title, chunks=len(chunks)), 201


@app.route("/api/docs", methods=["GET"])
def list_docs():
    with rag.connect() as conn:
        _, denied = staff_only(conn)
        return denied or jsonify(documents=rag.list_documents(conn))


@app.route("/api/docs/<int:doc_id>", methods=["GET"])
def get_doc(doc_id):
    """Retrieve document details and chunks by ID (404 if deleted/not found)."""
    with rag.connect() as conn:
        _, denied = staff_only(conn)
        if denied:
            return denied
        doc = rag.get_document(conn, doc_id)
        if not doc:
            return jsonify(error="Document not found"), 404
        payload = dict(doc)
        payload["document"] = doc
        return jsonify(payload)


@app.route("/api/docs/<int:doc_id>", methods=["DELETE"])
def delete_doc(doc_id):
    with rag.connect() as conn:
        _, denied = staff_only(conn)
        if denied:
            return denied
        if not rag.delete_document(conn, doc_id):
            return jsonify(error="Document not found"), 404
    return "", 204


@app.route("/api/rag/retrieve", methods=["POST"])
def retrieve_chunks():
    """Retrieve top-ranked chunks for a query without calling Gemini."""
    with rag.connect() as conn:
        _, denied = auth.check_permission(conn, auth.ALLOWED_RETRIEVE_ROLES)
        if denied:
            return denied
        body = request.get_json(silent=True)
        query = None
        if isinstance(body, dict):
            query = body.get("query") or body.get("q") or body.get("text")
        if not isinstance(query, str) or not query.strip():
            return jsonify(error="Query is required"), 400
        query = query.strip()
        try:
            vectors = rag.embed(client, [query], "RETRIEVAL_QUERY")
        except rag.EmbedError:
            app.logger.exception("Embedding the query failed")
            return jsonify(error="The assistant is unavailable right now, try again later"), 503
        hits = rag.retrieve(conn, vectors[0])
        results = [{"score": float(score), "title": title, "text": text} for score, title, text in hits]
        return jsonify(results=results, chunks=results, hits=results)

@app.route("/webhook", methods=["GET"])
def verify_webhook():
    """Facebook Webhook verification handshake"""
    mode = request.args.get("hub.mode")
    token = request.args.get("hub.verify_token")
    challenge = request.args.get("hub.challenge")

    if mode and token:
        if mode == "subscribe" and token == VERIFY_TOKEN:
            return challenge, 200
        else:
            return "Verification failed", 403
    return "Hello world", 200

@app.route("/webhook", methods=["POST"])
def handle_messages():
    """Receives incoming messages from Facebook Messenger and replies via Gemini"""
    body = request.get_json()

    if body.get("object") == "page":
        for entry in body.get("entry", []):
            for messaging_event in entry.get("messaging", []):
                
                # Check if the event contains a text message and isn't an echo
                if "message" in messaging_event and "text" in messaging_event["message"] and not messaging_event["message"].get("is_echo"):
                    sender_id = messaging_event["sender"]["id"]
                    message_text = messaging_event["message"]["text"]

                    # Generate reply using Gemini Flash (fast & lightweight)
                    try:
                        response = client.models.generate_content(
                            model=GEMINI_MODEL,
                            contents=message_text,
                        )
                        reply_text = response.text
                    except Exception as e:
                        reply_text = "I'm currently experiencing high traffic. Please try again in a moment."

                    # Send the response back to user via Facebook Graph API
                    send_facebook_message(sender_id, reply_text)

        return "EVENT_RECEIVED", 200
    return "Not Found", 404

def send_facebook_message(recipient_id, text):
    """Sends a message back to the user on Facebook Messenger"""
    url = f"https://graph.facebook.com/v18.0/me/messages?access_token={PAGE_ACCESS_TOKEN}"
    payload = {
        "recipient": {"id": recipient_id},
        "message": {"text": text}
    }
    headers = {"Content-Type": "application/json"}
    requests.post(url, json=payload, headers=headers)

@app.route("/")
def home():
    return("Hello from local server Ngrok")
if __name__ == "__main__":
    if not os.getenv("NO_NGROK") and os.getenv("NGROK_AUTHTOKEN"):
        try:
            listener = ngrok.forward(5000)
            print(f" * Public URL: {listener.url()}")
        except Exception as e:
            print(f" * Ngrok tunnel skipped: {e}")
    app.run(port=5000)

