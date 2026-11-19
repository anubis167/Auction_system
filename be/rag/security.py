"""Security module for detecting and preventing prompt injection and ejection attacks.

Provides:
- check_prompt_injection(data): Returns True if injection/ejection detected, False otherwise.
- detect_prompt_injection(data): Returns (is_injected, matched_pattern).
- validate_prompt_safety(data): Raises PromptInjectionError if injection detected.
- check_request_for_injection(req=None): Checks Flask request (args, JSON body, form), returns (jsonify(error="..."), 400) or None.
- require_prompt_safety: Flask route decorator.
- prompt_injection_middleware(app=None, paths=None): Flask before_request hook registration.
"""

from __future__ import annotations

import base64
import functools
import re
import unicodedata
import urllib.parse
from collections.abc import Iterable, Mapping
from typing import Any, Optional, Tuple


class PromptInjectionError(ValueError):
    """Raised when prompt injection or ejection attack is detected."""

    def __init__(self, message: str = "Prompt injection detected", pattern: Optional[str] = None):
        super().__init__(message)
        self.message = message
        self.pattern = pattern


# Regular expression patterns for prompt injection and ejection attacks
INJECTION_PATTERNS = [
    # 1. Instruction overrides & resets
    (
        "instruction_override_ignore",
        r"ignore\s*(?:all\s*)?(?:previous|prior|above|earlier|initial|original|preceding)\s*(?:instructions?|prompts?|rules?|directives?|commands?|constraints?)",
    ),
    (
        "instruction_override_disregard",
        r"disregard\s*(?:all\s*)?(?:previous|prior|above|earlier|initial|original|preceding)\s*(?:instructions?|prompts?|rules?|directives?|commands?|constraints?)",
    ),
    (
        "instruction_override_forget",
        r"forget\s*(?:all\s*)?(?:previous|prior|above|earlier|initial|original|preceding|everything)\s*(?:instructions?|prompts?|rules?|directives?|commands?|constraints?|told\s+so\s+far)?",
    ),
    (
        "instruction_override_skip",
        r"skip\s*(?:all\s*)?(?:previous|prior|above|earlier)\s*(?:instructions?|prompts?|rules?|directives?|commands?)",
    ),
    (
        "instruction_override_override",
        r"override\s*(?:all\s*)?(?:previous|prior|above|earlier|system)\s*(?:instructions?|prompts?|rules?|directives?|commands?)",
    ),
    (
        "instruction_override_reset",
        r"(?:reset|clear)\s*(?:all\s*)?(?:previous|prior|initial)\s*(?:instructions?|prompts?|context)",
    ),
    (
        "new_instructions_marker",
        r"new\s+instructions?\s*:",
    ),
    (
        "stop_and_follow",
        r"stop\s+what\s+you\s+are\s+doing\s+and\s+(?:follow|read|obey)\b",
    ),

    # 2. Safety bypass & filter disabling
    (
        "safety_bypass",
        r"bypass\s*(?:all\s*)?(?:safety|security|system|content)?\s*(?:filters?|guardrails?|guidelines?|instructions?|rules?|restrictions?)",
    ),
    (
        "safety_disable",
        r"disable\s*(?:all\s*)?(?:safety|content|security)?\s*(?:filters?|guardrails?|policies|policy|rules?|restrictions?)",
    ),
    (
        "safety_turn_off",
        r"turn\s+off\s*(?:all\s*)?(?:safety|security|filters?|guardrails?|restrictions?)",
    ),
    (
        "no_safety_rules",
        r"no\s+safety\s*(?:guidelines|filters?|rules?|restrictions?)",
    ),
    (
        "without_safety_restrictions",
        r"without\s*(?:any\s*)?(?:safety|content|ethical)?\s*(?:filters?|restrictions?|guidelines?|rules?)",
    ),

    # 3. System prompt exfiltration & ejection
    (
        "system_prompt_direct",
        r"\bsystem\s+prompts?\b",
    ),
    (
        "system_instruction_direct",
        r"\bsystem\s+instructions?\b",
    ),
    (
        "reveal_system_prompt",
        r"(?:show|reveal|print|display|dump|leak|repeat|output|echo|tell\s+me)\s*(?:your\s+|the\s+)?(?:system\s+prompt|initial\s+prompt|system\s+instructions?|developer\s+prompt|hidden\s+prompt|base\s+prompt|initial\s+instructions?)",
    ),
    (
        "query_system_prompt",
        r"what\s*(?:is|are|was|were)\s*(?:your\s+|the\s+)?(?:system\s+prompt|system\s+instructions?|initial\s+instructions?|original\s+prompt)",
    ),
    (
        "repeat_above",
        r"repeat\s*(?:all\s*)?(?:everything|the\s+text|the\s+words|the\s+instructions?|all|text|words|instructions?)\s*(?:above|before|prior)",
    ),
    (
        "output_initialization",
        r"output\s*(?:your\s+)?initialization\s*(?:prompt|sequence|instructions?)",
    ),
    (
        "print_everything_before",
        r"print\s*everything\s*(?:above|before\s+this)",
    ),
    (
        "prompt_ejection_or_injection",
        r"\bprompt\s*(?:ejection|injection)\b",
    ),

    # 4. Jailbreak & DAN patterns
    (
        "dan_mode",
        r"\b(?:dan\s+mode|do\s+anything\s+now)\b",
    ),
    (
        "jailbreak_keyword",
        r"\bjailbreak(?:s|ed|ing)?\b",
    ),
    (
        "jail_break_spaced",
        r"\bjail\s*break\b",
    ),
    (
        "evil_confidant",
        r"(?:evil|unfiltered|jailbroken)\s+confidant",
    ),
    (
        "developer_mode",
        r"developer\s+mode\s*(?:enabled|on|activated|start|true|active)",
    ),
    (
        "unrestricted_model",
        r"unrestricted\s*(?:mode|assistant|model|ai)",
    ),
    (
        "aim_jailbreak",
        r"\baim\s+jailbreak\b",
    ),
    (
        "you_are_dan",
        r"you\s+are\s*(?:now\s+)?dan\b",
    ),
    (
        "act_as_dan",
        r"act\s+as\s+dan\b",
    ),
    (
        "pretend_dan",
        r"pretend\s*(?:to\s+be|you\s+are)\s+dan\b",
    ),
    (
        "dan_version",
        r"dan\s+\d+(?:\.\d+)?",
    ),

    # 5. Roleplay & Persona overrides
    (
        "roleplay_unrestricted",
        r"(?:act|pretend|simulate|behave|roleplay)\s*(?:to\s+be|that\s+you\s+are|you\s+are|as\s+if\s+you\s+are|as|like)?\s*(?:an?\s+)?(?:unrestricted|unfiltered|jailbroken|evil|dan|do\s+anything\s+now|hacker|lawless|unaligned)\b",
    ),
    (
        "unfiltered_persona_direct",
        r"\b(?:jailbroken|unfiltered|unrestricted)\s+(?:assistant|model|ai|bot|chat\s*bot|persona)\b",
    ),
    (
        "persona_override_now",
        r"(?:you\s+are\s+now|starting\s+now\s+you\s+are)\s+(?:an?\s+)?(?:unrestricted|unfiltered|jailbroken|evil|dan|do\s+anything\s+now|unaligned)\b",
    ),
    (
        "answer_without_restrictions",
        r"(?:you\s+must\s+now\s+answer|answer\s+all\s+questions)\s+without\s+(?:any\s+)?(?:restrictions?|rules?|filters?|guidelines?)\b",
    ),
    (
        "hypothetical_jailbreak",
        r"hypothetical\s*(?:scenario|mode)\s*(?:where|in\s+which)\s*you\s*(?:ignore|have\s+no|bypass)\s*(?:all\s+)?(?:rules?|restrictions?|filters?|guidelines?)\b",
    ),
    (
        "play_role_jailbreak",
        r"play\s+the\s+role\s+of\s+(?:an?\s+)?(?:unrestricted|unfiltered|jailbroken|evil|dan)\b",
    ),
    (
        "you_will_now_act_as",
        r"you\s+will\s+now\s+act\s+as\b",
    ),

    # 6. Delimiter / Tag injections
    (
        "system_tag_open",
        r"<\s*system\s*(?:prompt)?[^>]*>",
    ),
    (
        "system_tag_close",
        r"<\s*/\s*system\s*>",
    ),
    (
        "system_bracket_open",
        r"\[\s*system\s*(?:prompt)?\s*\]",
    ),
    (
        "system_bracket_close",
        r"\[\s*/\s*system\s*\]",
    ),
    (
        "system_markdown_header",
        r"###\s*system(?:\s+prompt)?\b",
    ),
    (
        "instruction_markdown_header",
        r"###\s*instruction\b",
    ),
    (
        "instruction_bracket",
        r"\[\s*instruction\s*\]",
    ),
    (
        "instruction_tag",
        r"<\s*instruction\s*>",
    ),
]

COMPILED_PATTERNS = [
    (name, re.compile(pattern, re.IGNORECASE))
    for name, pattern in INJECTION_PATTERNS
]


def _normalize_text(text: str) -> str:
    """Normalize text by stripping unicode variations and invisible chars."""
    norm = unicodedata.normalize("NFKD", text)
    # Remove zero-width and directional formatting chars
    norm = re.sub(r"[\u200b-\u200f\ufeff\u202a-\u202e]", "", norm)
    return norm


def _check_string_variants(text: str) -> Optional[str]:
    """Test normalized variants of a string against injection patterns."""
    if not text:
        return None

    # Variant 1: Raw text
    norm = _normalize_text(text)

    # Variant 2: URL decoded
    try:
        url_decoded = urllib.parse.unquote(norm)
    except Exception:
        url_decoded = norm

    # Variant 3: Collapsed consecutive whitespace
    collapsed = re.sub(r"\s+", " ", norm).strip()

    # Variant 4: Deobfuscated letter spacing (e.g., 'i g n o r e   p r e v i o u s')
    words = [re.sub(r"\s+", "", w) for w in re.split(r"\s{2,}", norm)]
    deob_spaced = " ".join(words)

    variants = [norm, collapsed, deob_spaced]
    if url_decoded != norm:
        variants.extend([url_decoded, re.sub(r"\s+", " ", url_decoded).strip()])

    for variant in variants:
        for name, pattern in COMPILED_PATTERNS:
            if pattern.search(variant):
                return name

    # Check for potential base64-encoded payload (min length 16, valid b64 chars)
    stripped = collapsed.strip()
    if len(stripped) >= 16 and re.fullmatch(r"[A-Za-z0-9+/=]+", stripped):
        try:
            decoded_bytes = base64.b64decode(stripped, validate=True)
            decoded_str = decoded_bytes.decode("utf-8", errors="ignore")
            if decoded_str:
                for name, pattern in COMPILED_PATTERNS:
                    if pattern.search(decoded_str):
                        return f"base64_{name}"
        except Exception:
            pass

    return None


def detect_prompt_injection(data: Any, visited: Optional[set[int]] = None) -> Tuple[bool, Optional[str]]:
    """
    Recursively inspects data (str, dict, list, query params, etc.) for prompt injection/ejection.
    Returns (True, pattern_name) if detected, or (False, None) if safe.
    """
    if data is None:
        return False, None

    if isinstance(data, (int, float, bool)):
        return False, None

    if isinstance(data, (str, bytes)):
        text = data.decode("utf-8", errors="ignore") if isinstance(data, bytes) else data
        matched = _check_string_variants(text)
        if matched:
            return True, matched
        return False, None

    if visited is None:
        visited = set()

    obj_id = id(data)
    if obj_id in visited:
        return False, None

    visited.add(obj_id)
    try:
        # MultiDict or Mapping with .to_dict()
        if hasattr(data, "to_dict"):
            try:
                dict_repr = data.to_dict(flat=False)
                return detect_prompt_injection(dict_repr, visited)
            except Exception:
                pass

        # Mapping / dictionary
        if isinstance(data, Mapping) or hasattr(data, "items"):
            for k, v in data.items():
                injected, pattern = detect_prompt_injection(k, visited)
                if injected:
                    return True, pattern
                injected, pattern = detect_prompt_injection(v, visited)
                if injected:
                    return True, pattern
            return False, None

        # Iterables (lists, tuples, sets)
        if isinstance(data, Iterable) and not isinstance(data, (str, bytes)):
            for item in data:
                injected, pattern = detect_prompt_injection(item, visited)
                if injected:
                    return True, pattern
            return False, None

        return False, None
    finally:
        visited.discard(obj_id)


def check_prompt_injection(data: Any) -> bool:
    """
    Inspects data (text, JSON object, query params, lists) for prompt ejection/injection.
    Returns True if an attack is detected, False otherwise.
    """
    injected, _ = detect_prompt_injection(data)
    return injected


def validate_prompt_safety(data: Any) -> None:
    """
    Validates data for prompt injection safety.
    Raises PromptInjectionError("Prompt injection detected") if an attack is found.
    """
    injected, pattern = detect_prompt_injection(data)
    if injected:
        raise PromptInjectionError("Prompt injection detected", pattern=pattern)


def check_request_for_injection(req=None):
    """
    Inspects Flask request (query params, JSON body, form data) for prompt injection.
    Returns (jsonify(error="Prompt injection detected"), 400) if injection found,
    or None if request is safe.
    """
    if req is None:
        try:
            from flask import request as flask_req
            req = flask_req
        except ImportError:
            return None

    from flask import jsonify

    # 1. Query parameters
    if req.args:
        try:
            args_dict = req.args.to_dict(flat=False)
        except Exception:
            args_dict = dict(req.args)
        if check_prompt_injection(args_dict):
            return jsonify(error="Prompt injection detected"), 400

    # 2. JSON body
    if req.is_json:
        try:
            json_data = req.get_json(silent=True)
            if json_data is not None and check_prompt_injection(json_data):
                return jsonify(error="Prompt injection detected"), 400
        except Exception:
            pass

    # 3. Form data
    if req.form:
        try:
            form_dict = req.form.to_dict(flat=False)
        except Exception:
            form_dict = dict(req.form)
        if check_prompt_injection(form_dict):
            return jsonify(error="Prompt injection detected"), 400

    return None


def require_prompt_safety(f):
    """
    Flask route decorator that rejects requests containing prompt injection with HTTP 400.
    """
    @functools.wraps(f)
    def decorated_function(*args, **kwargs):
        denied = check_request_for_injection()
        if denied:
            return denied
        return f(*args, **kwargs)

    return decorated_function


def prompt_injection_middleware(app=None, paths: Optional[Iterable[str]] = None):
    """
    Registers a before_request hook on the Flask app to block prompt injection.
    By default monitors paths starting with ('/api/chat', '/api/docs', '/api/rag').
    """
    monitored_paths = tuple(paths) if paths is not None else ("/api/chat", "/api/docs", "/api/rag")

    def before_request_hook():
        from flask import request as flask_req

        if any(flask_req.path.startswith(prefix) for prefix in monitored_paths):
            denied = check_request_for_injection(flask_req)
            if denied:
                return denied
        return None

    if app is not None:
        app.before_request(before_request_hook)

    return before_request_hook
