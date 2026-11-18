"""chat-1.2 / rag2-1.4: validate the chat box's conversation and turn it into Gemini contents."""
MAX_TURNS = 20
MAX_TEXT = 1000


def check_messages(body):
    """Gemini contents for a valid {messages: [{role, text}]} body ending with the user's turn, else None."""
    messages = body.get("messages") if isinstance(body, dict) else None
    if not isinstance(messages, list) or not 1 <= len(messages) <= MAX_TURNS:
        return None
    contents = []
    for message in messages:
        role = message.get("role") if isinstance(message, dict) else None
        text = message.get("text") if isinstance(message, dict) else None
        if role not in ("user", "model") or not isinstance(text, str) or not text or (role == "user" and len(text) > MAX_TEXT):
            return None
        # The bot's own replies can pass MAX_TEXT and come back as history: trim them, refusing would end the conversation
        contents.append({"role": role, "parts": [{"text": text[:MAX_TEXT]}]})
    return contents if contents[-1]["role"] == "user" else None
