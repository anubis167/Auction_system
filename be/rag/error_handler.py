"""Global error handling module for Flask RAG API.

Registers JSON error handlers for standard HTTP error status codes:
(400, 401, 403, 404, 405, 413, 429) and generic Exception (500),
ensuring structured responses: `{"error": "<message>"}` with Content-Type application/json.
"""

from __future__ import annotations

from typing import Any
from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException, default_exceptions

STANDARD_MESSAGES = {
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    413: "Request Entity Too Large",
    429: "Too Many Requests",
    500: "Internal server error",
}


def make_error_response(message: str, status_code: int):
    """Creates a consistent JSON error response tuple."""
    return jsonify(error=message), status_code


def register_error_handlers(app: Flask) -> None:
    """Registers structured JSON error handlers on the Flask app."""

    def create_http_handler(code: int, default_msg: str):
        def http_handler(err: Any):
            msg = default_msg
            if isinstance(err, HTTPException):
                orig_cls = default_exceptions.get(code)
                if orig_cls and err.description != orig_cls.description and err.description:
                    msg = err.description
                elif not orig_cls and err.description:
                    msg = err.description
            return jsonify(error=msg), code

        return http_handler

    for code, default_msg in STANDARD_MESSAGES.items():
        if code == 500:
            continue
        app.register_error_handler(code, create_http_handler(code, default_msg))

    @app.errorhandler(Exception)
    def handle_unhandled_exception(err: Exception):
        app.logger.exception("Unhandled server exception: %s", err)
        if isinstance(err, HTTPException):
            code = err.code or 500
            default_msg = STANDARD_MESSAGES.get(code, err.name or "Error")
            orig_cls = default_exceptions.get(code)
            if orig_cls and err.description != orig_cls.description and err.description:
                msg = err.description
            else:
                msg = default_msg
            return jsonify(error=msg), code

        return jsonify(error="Internal server error"), 500


init_error_handlers = register_error_handlers
