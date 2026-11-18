"""rag2-1.3: prompt text lives in be/rag/prompts/*.md, never in Python strings."""
import os
from functools import lru_cache

PROMPT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "prompts")


@lru_cache(maxsize=None)
def load_prompt(name):
    """The text of prompts/<name>.md without the trailing newline (read once; restart to pick up edits)."""
    if not name.isidentifier():
        raise ValueError(f"bad prompt name {name!r}")
    with open(os.path.join(PROMPT_DIR, f"{name}.md"), encoding="utf-8") as f:
        return f.read().rstrip("\n")
