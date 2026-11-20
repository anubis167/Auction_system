"""The FAQ question a chat message matches word for word (case and extra spaces ignored), or None. A message that is
not on faq_questions.json (written from the FAQ document) is a dynamic question."""
import json
import os

_FAQ_PATH = os.path.join(os.path.dirname(__file__), "..", "faq_questions.json")


def _norm(text):
    return " ".join(text.split()).casefold()


with open(_FAQ_PATH, encoding="utf-8") as f:
    _FAQ = {_norm(q): q for q in json.load(f)}


def faq_question(text):
    """The FAQ question's text as written in the document, or None."""
    return _FAQ.get(_norm(text))
