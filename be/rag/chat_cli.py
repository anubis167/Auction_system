"""Chat with the site's Gemini bot in the terminal: python be/rag/chat_cli.py (type exit or press Ctrl+C to quit)."""
from chat import GEMINI_MODEL, client
from functions.build_prompt import build_prompt

PROMPT = build_prompt(None, [])  # rag2-1.3: same prompt as the chat box, as a guest without excerpts

history = []
try:
    while True:
        text = input("You: ").strip()
        if text.lower() in ("exit", "quit"):
            break
        if not text:
            continue

        history.append({"role": "user", "parts": [{"text": text}]})
        try:
            reply = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=history,
                config={"system_instruction": PROMPT},
            ).text
        except Exception as e:
            reply = None
            print(f"Gemini error: {e}")

        if reply:
            history.append({"role": "model", "parts": [{"text": reply}]})
            print(f"Gemini: {reply}")
        else:
            history.pop()  # keep the conversation valid so the next message still works
except (EOFError, KeyboardInterrupt):
    print()
