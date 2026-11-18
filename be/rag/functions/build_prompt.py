"""rag2-1.3: the full system instruction for one /api/chat call."""
import re

from functions.load_prompt import load_prompt

_PLACEHOLDER = re.compile(r"\{(\w+)\}")


def _clean(value):
    """Untrusted text cannot open or close a prompt section (same idea as ecbot's sanitize_config_value)."""
    return str(value).replace("<", "‹").replace(">", "›")


def _fill(template, values):
    # One pass, so a value that itself contains "{name}" is never filled in again
    return _PLACEHOLDER.sub(lambda m: values[m.group(1)], template)


def _account(user):
    if not user:
        return load_prompt("guest")
    bids = "; ".join(f"{b['auction']}: {b['amount']} ({b['status']})" for b in user["bids"]) or "none"
    lots = "; ".join(f"{l['name']}: {l['status']}, price {l['price']}, ends {l['endsAt']}" for l in user["lots"]) or "none"
    credit = user["credit"]
    return _fill(load_prompt("account"), {
        "username": _clean(user["username"]), "bids": _clean(bids), "lots": _clean(lots),
        "balance": _clean(credit["balance"]), "held": _clean(credit["held"]), "available": _clean(credit["available"]),
    })


def build_prompt(user, hits):
    """system.md + the visitor's account (or the guest note) + the excerpts, when there are any.
    user: session_user()'s dict or None; hits: retrieve()'s (score, title, text) list."""
    parts = [load_prompt("system"), _account(user)]
    if hits:
        excerpts = "\n".join(f"<untrusted>\n[{_clean(title)}]\n{_clean(text)}\n</untrusted>" for _, title, text in hits)
        parts.append(_fill(load_prompt("excerpts"), {"excerpts": excerpts}))
    return "\n\n".join(parts)
