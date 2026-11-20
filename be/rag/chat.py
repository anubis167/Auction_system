"""The site's chat bot (POST /api/chat), its document library (/api/docs) and the Messenger webhook.
rag2: thin routes only. Data comes from the Node API (functions/call_api.py), never from the database; each step is
one function in functions/, and the prompt text lives in prompts/."""
import os
import time

import ngrok
import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from google import genai

import error_handler
import security

from functions.build_prompt import build_prompt
from functions.call_api import COOKIE, ApiError, call_api
from functions.check_messages import check_messages
from functions.cited_chunks import cited_chunks
from functions.chunk_text import chunk_text
from functions.embed import EmbedError, embed
from functions.guard_reason import guard_reason
from functions.guard_reply import FALLBACK
from functions.handoff_or_error import handoff_or_error
from functions.log_turn import log_turn
from functions.over_limit import over_limit
from functions.read_upload import DOC_MAX_BYTES, UploadError, read_upload
from functions.retrieve import retrieve
from functions.session_user import session_user

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
load_dotenv()

app = Flask(__name__)
# rag-2.1: room for one 10 MB document plus its multipart wrapping; bigger bodies get 413 before they are read
app.config["MAX_CONTENT_LENGTH"] = DOC_MAX_BYTES + 128 * 1024

# rag-3.1: every error, expected or not, answers JSON {"error": ...}
error_handler.register_error_handlers(app)
# rag-3.2: prompt injection in a query, JSON body or form is refused with 400 before any route runs
security.prompt_injection_middleware(app, paths=("/api/chat", "/api/docs", "/api/rag"))

if os.getenv("NGROK_AUTHTOKEN"):
    ngrok.set_auth_token(os.getenv("NGROK_AUTHTOKEN"))
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


def visitor_token():
    """rag-3.3: the visitor's session JWT from the cookie, or from "Authorization: Bearer"; Node verifies either one."""
    auth = request.headers.get("Authorization", "")
    return request.cookies.get(COOKIE) or (auth[7:].strip() if auth.startswith("Bearer ") else None)


def api_failure(e, passed_on=(400, 401, 403, 404, 413)):
    """Flask answer for an ApiError: Node's own refusal is passed on when its status is in passed_on, else 502."""
    if e.status in passed_on:
        return jsonify(error=e.message or "Request refused"), e.status
    app.logger.error("API call failed: %s", e)
    return jsonify(error="The document service is unavailable right now, try again later"), 502


@app.route("/api/chat/health")
def chat_health():
    """The chat box asks this on open; no answer means the bot service is not running"""
    return jsonify(ok=True)


def _tokens(response, field):
    """A token count from Gemini's usage_metadata, or None when it is missing."""
    value = getattr(getattr(response, "usage_metadata", None), field, None)
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _save_turn(contents, started, outcome, bot_text=None, guard=None, response=None, hits=()):
    """rag-train-2: log this /api/chat turn (visitor token from the body, user from the cookie); its id or None."""
    body = request.get_json(silent=True)
    body = body if isinstance(body, dict) else {}
    # rag-train-5: the chat box sends logging: false when the visitor opted out
    return log_turn(visitor_token(), body.get("visitor"), consent=body.get("logging") is not False, turn={
        "userText": contents[-1]["parts"][0]["text"], "botText": bot_text, "outcome": outcome, "guardTriggered": guard,
        "model": GEMINI_MODEL, "promptTokens": _tokens(response, "prompt_token_count"),
        "completionTokens": _tokens(response, "candidates_token_count"),
        "latencyMs": int((time.monotonic() - started) * 1000),
        "retrievals": cited_chunks(bot_text if outcome == "answered" else "", hits),
    })


def _cannot_serve(contents, started, user, reason, error, status, hits=()):
    """handoff_or_error, logged as handed_off (customer) or error (everyone else)."""
    _save_turn(contents, started, "handed_off" if user and user["role"] == "customer" else "error", bot_text=error,
               hits=hits)
    return handoff_or_error(user, reason, error, status)


@app.after_request
def log_refused_chat(response):
    """rag-train-2: security.py refuses prompt injection before web_chat runs; the turn is still logged as refused."""
    if (request.path == "/api/chat" and request.method == "POST" and response.status_code == 400
            and (response.get_json(silent=True) or {}).get("error") == "Prompt injection detected"):
        contents = check_messages(request.get_json(silent=True))
        if contents:
            _save_turn(contents, time.monotonic(), "refused", guard="prompt_injection")
    return response


@app.route("/api/chat", methods=["POST"])
def web_chat():
    """Embedded site chat: the browser sends the conversation, Gemini answers the last message"""
    started = time.monotonic()
    contents = check_messages(request.get_json(silent=True))
    if contents is None:
        return jsonify(error="Invalid messages"), 400

    limited = over_limit()
    # rag-1.7: the visitor only ever comes from their own session cookie, checked by Node; never from the body
    try:
        user = session_user(visitor_token())
    except ApiError:
        app.logger.exception("Visitor lookup failed, answering as a guest")
        user = None
    if limited:
        # sch-1.3: no embedding either, it would be one more Gemini call
        return _cannot_serve(contents, started, user, "limit", "Too many messages, please wait a minute", 429)

    # rag-1.5: the best matching excerpts of uploaded documents; without them the bot still answers
    try:
        hits = retrieve(client, contents[-1]["parts"][0]["text"])
    except (ApiError, EmbedError):
        app.logger.exception("Document search failed, answering without it")
        hits = []

    response = None
    try:
        response = client.models.generate_content(
            model=GEMINI_MODEL, contents=contents, config={"system_instruction": build_prompt(user, hits)},
        )
        reply = response.text
    except Exception:
        app.logger.exception("Gemini call failed")
        reply = None
    if not reply:
        return _cannot_serve(contents, started, user, "unavailable", "The assistant is unavailable right now", 503, hits)
    guard = guard_reason(reply)
    reply = FALLBACK if guard else reply
    turn_id = _save_turn(contents, started, "refused" if guard else "answered", bot_text=reply, guard=guard,
                         response=response, hits=hits)
    answer = {"reply": reply}
    if hits:
        answer["sources"] = list(dict.fromkeys(hit[1] for hit in hits))
    if turn_id is not None:
        answer["turnId"] = turn_id
    return jsonify(answer)


@app.route("/api/chat/feedback", methods=["POST"])
def chat_feedback():
    """rag-train-4: thumbs up or down on a saved bot answer; Node checks the visitor token owns the turn."""
    body = request.get_json(silent=True)
    body = body if isinstance(body, dict) else {}
    turn_id, feedback, visitor = body.get("turnId"), body.get("feedback"), body.get("visitor")
    if (not isinstance(turn_id, int) or isinstance(turn_id, bool) or turn_id < 1 or feedback not in ("up", "down")
            or not isinstance(visitor, str)):
        return jsonify(error="Invalid feedback"), 400
    try:
        saved = call_api("PUT", f"/api/rag/turns/{turn_id}/feedback", internal=True,
                         json={"visitor": visitor, "feedback": feedback})
    except ApiError as e:
        return api_failure(e, passed_on=(400, 403, 404))
    return jsonify(turnId=saved.get("turnId", turn_id), feedback=saved.get("feedback", feedback))


@app.route("/api/docs", methods=["POST"])
def upload_doc():
    """rag-1.4: store a .txt/.md document, its chunks and their embeddings for the chat box (through the API)"""
    cookie = visitor_token()
    try:
        # Cheap check before spending Gemini calls; Node checks knowledge.manage again when the document is saved
        user = session_user(cookie)
    except ApiError as e:
        return api_failure(e)
    if not user:
        return jsonify(error="Authentication required"), 401
    if user["role"] not in ("staff", "admin"):
        return jsonify(error="Forbidden"), 403

    try:
        filename, mime_type, content = read_upload(request.files.get("file"))
    except UploadError as e:
        return jsonify(error=str(e)), e.status
    chunks = chunk_text(content)
    if not chunks:
        return jsonify(error="The file is empty"), 400
    title = (request.form.get("title") or "").strip()[:255] or os.path.splitext(filename)[0][:255]

    try:
        vectors = embed(client, chunks, "RETRIEVAL_DOCUMENT")
    except EmbedError:
        app.logger.exception("Embedding the upload failed")
        return jsonify(error="The assistant is unavailable right now, try again later"), 503
    try:
        saved = call_api("POST", "/api/rag/documents", cookie=cookie, internal=True, json={
            "title": title, "filename": filename, "mimeType": mime_type, "content": content,
            "chunks": [{"text": text, "embedding": vector} for text, vector in zip(chunks, vectors)],
        })
    except ApiError as e:
        # The visitor's session was just accepted, so a 401 here is this service's token: a server fault, not theirs
        return api_failure(e, passed_on=(400, 403, 413))
    if not isinstance(saved.get("id"), int):
        return api_failure(ApiError("POST /api/rag/documents: no id in the answer"))
    return jsonify(id=saved["id"], title=saved.get("title", title), chunks=len(chunks)), 201


@app.route("/api/docs", methods=["GET"])
def list_docs():
    try:
        body = call_api("GET", "/api/rag/documents", cookie=visitor_token())
    except ApiError as e:
        return api_failure(e)
    if not isinstance(body.get("documents"), list):
        return api_failure(ApiError("GET /api/rag/documents: no document list"))
    return jsonify(documents=body["documents"])


@app.route("/api/docs/<int:doc_id>", methods=["DELETE"])
def delete_doc(doc_id):
    try:
        call_api("DELETE", f"/api/rag/documents/{doc_id}", cookie=visitor_token(), expect=None)
    except ApiError as e:
        return api_failure(e)
    return "", 204


@app.route("/api/docs/<int:doc_id>", methods=["GET"])
def get_doc(doc_id):
    """rag-3.4: one live document with its chunks (404 once soft-deleted)."""
    try:
        doc = call_api("GET", f"/api/rag/documents/{doc_id}", cookie=visitor_token())
    except ApiError as e:
        return api_failure(e)
    if not isinstance(doc.get("id"), int) or not isinstance(doc.get("chunks"), list):
        return api_failure(ApiError(f"GET /api/rag/documents/{doc_id}: malformed document"))
    return jsonify(doc)


@app.route("/api/rag/retrieve", methods=["POST"])
def retrieve_chunks():
    """rag-3.4: the best matching excerpts for a query, without asking Gemini for an answer. Signed-in users only."""
    try:
        user = session_user(visitor_token())
    except ApiError as e:
        return api_failure(e)
    if not user:
        return jsonify(error="Authentication required"), 401
    body = request.get_json(silent=True)
    query = body.get("query") if isinstance(body, dict) else None
    if not isinstance(query, str) or not query.strip():
        return jsonify(error="Query is required"), 400
    try:
        hits = retrieve(client, query.strip())
    except EmbedError:
        app.logger.exception("Embedding the query failed")
        return jsonify(error="The assistant is unavailable right now, try again later"), 503
    except ApiError as e:
        return api_failure(e)
    return jsonify(results=[{"score": float(score), "title": title, "text": text} for score, title, text, *_ in hits])


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
