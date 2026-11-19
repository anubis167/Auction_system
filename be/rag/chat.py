"""The site's chat bot (POST /api/chat), its document library (/api/docs) and the Messenger webhook.
rag2: thin routes only. Data comes from the Node API (functions/call_api.py), never from the database; each step is
one function in functions/, and the prompt text lives in prompts/."""
import os

import ngrok
import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from google import genai

from functions.build_prompt import build_prompt
from functions.call_api import COOKIE, ApiError, call_api
from functions.check_messages import check_messages
from functions.chunk_text import chunk_text
from functions.embed import EmbedError, embed
from functions.guard_reply import guard_reply
from functions.handoff_or_error import handoff_or_error
from functions.over_limit import over_limit
from functions.read_upload import DOC_MAX_BYTES, UploadError, read_upload
from functions.retrieve import retrieve
from functions.session_user import session_user

load_dotenv()

app = Flask(__name__)
# rag-1.4: room for one 2 MB document plus its multipart wrapping; bigger bodies get 413 before they are read
app.config["MAX_CONTENT_LENGTH"] = DOC_MAX_BYTES + 64 * 1024
ngrok.set_auth_token(os.getenv("NGROK_AUTHTOKEN"))
# Gemini often answers 503 "high demand" for a few seconds, so the SDK retries; the timeout stops a hung call blocking the box
client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY"),
    http_options={"timeout": 30000, "retry_options": {"attempts": 4}},
)
# An alias, because Google retires pinned models (gemini-2.5-flash stopped working for this key)
GEMINI_MODEL = "gemini-flash-lite-latest"

# Credentials from Facebook Developer Console
PAGE_ACCESS_TOKEN = os.getenv("FACEBOOK_PAGE_ACCESS_TOKEN")
VERIFY_TOKEN = os.getenv("FACEBOOK_VERIFY_TOKEN", "my_secure_verify_token")


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


@app.route("/api/chat", methods=["POST"])
def web_chat():
    """Embedded site chat: the browser sends the conversation, Gemini answers the last message"""
    contents = check_messages(request.get_json(silent=True))
    if contents is None:
        return jsonify(error="Invalid messages"), 400

    limited = over_limit()
    # rag-1.7: the visitor only ever comes from their own session cookie, checked by Node; never from the body
    try:
        user = session_user(request.cookies.get(COOKIE))
    except ApiError:
        app.logger.exception("Visitor lookup failed, answering as a guest")
        user = None
    if limited:
        # sch-1.3: no embedding either, it would be one more Gemini call
        return handoff_or_error(user, "limit", "Too many messages, please wait a minute", 429)

    # rag-1.5: the best matching excerpts of uploaded documents; without them the bot still answers
    try:
        hits = retrieve(client, contents[-1]["parts"][0]["text"])
    except (ApiError, EmbedError):
        app.logger.exception("Document search failed, answering without it")
        hits = []

    try:
        reply = client.models.generate_content(
            model=GEMINI_MODEL, contents=contents, config={"system_instruction": build_prompt(user, hits)},
        ).text
    except Exception:
        app.logger.exception("Gemini call failed")
        reply = None
    if not reply:
        return handoff_or_error(user, "unavailable", "The assistant is unavailable right now", 503)
    if not hits:
        return jsonify(reply=guard_reply(reply))
    return jsonify(reply=guard_reply(reply), sources=list(dict.fromkeys(title for _, title, _ in hits)))


@app.route("/api/docs", methods=["POST"])
def upload_doc():
    """rag-1.4: store a .txt/.md document, its chunks and their embeddings for the chat box (through the API)"""
    cookie = request.cookies.get(COOKIE)
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
        body = call_api("GET", "/api/rag/documents", cookie=request.cookies.get(COOKIE))
    except ApiError as e:
        return api_failure(e)
    if not isinstance(body.get("documents"), list):
        return api_failure(ApiError("GET /api/rag/documents: no document list"))
    return jsonify(documents=body["documents"])


@app.route("/api/docs/<int:doc_id>", methods=["DELETE"])
def delete_doc(doc_id):
    try:
        call_api("DELETE", f"/api/rag/documents/{doc_id}", cookie=request.cookies.get(COOKIE), expect=None)
    except ApiError as e:
        return api_failure(e)
    return "", 204


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
    listener = ngrok.forward(5000)
    print(f" * Public URL: {listener.url()}")
    app.run(port=5000)
