"""chat-1.2: how many Gemini chat calls the site's chat box may make per minute."""
import time
from collections import deque

CALLS_PER_MINUTE = 30
calls = deque()


def over_limit():
    """True when the limit is used up; otherwise counts this call.
    shortcut: one in-memory limit shared by all visitors, use a per-user limit if real traffic hits it"""
    now = time.time()
    while calls and now - calls[0] > 60:
        calls.popleft()
    if len(calls) >= CALLS_PER_MINUTE:
        return True
    calls.append(now)
    return False
