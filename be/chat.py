import os
import requests
from flask import Flask, request, jsonify
from dotenv import load_dotenv
from google import genai
import ngrok
import time
from collections import deque
load_dotenv()

app = Flask(__name__)
ngrok.set_auth_token(os.getenv("NGROK_AUTHTOKEN"))
# Initialize Gemini Client
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
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
    "You cannot see lots, bids, accounts or credit, so never state them; point the user to the matching page instead."
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
    """Embedded site chat: the browser sends the conversation, Gemini answers the last message"""
    body = request.get_json(silent=True)
    messages = body.get("messages") if isinstance(body, dict) else None
    if not isinstance(messages, list) or not 1 <= len(messages) <= MAX_TURNS:
        return jsonify(error="Invalid messages"), 400

    contents = []
    for message in messages:
        role = message.get("role") if isinstance(message, dict) else None
        text = message.get("text") if isinstance(message, dict) else None
        if role not in ("user", "model") or not isinstance(text, str) or not 1 <= len(text) <= MAX_TEXT:
            return jsonify(error="Invalid messages"), 400
        contents.append({"role": role, "parts": [{"text": text}]})
    if contents[-1]["role"] != "user":
        return jsonify(error="Invalid messages"), 400

    if over_web_limit():
        return jsonify(error="Too many messages, please wait a minute"), 429

    try:
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=contents,
            config={"system_instruction": WEB_PROMPT},
        )
        reply = response.text
    except Exception:
        app.logger.exception("Gemini call failed")
        reply = None
    if not reply:
        return jsonify(error="The assistant is unavailable right now"), 503
    return jsonify(reply=reply)

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

