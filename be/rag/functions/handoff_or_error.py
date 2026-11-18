"""sch-1.3: what /api/chat answers when the bot cannot serve the visitor."""
from flask import jsonify


def handoff_or_error(user, reason, error, status):
    """A signed-in customer is handed to staff; guests, staff and admin get the error."""
    if user and user["role"] == "customer":
        return jsonify(handoff=True, reason=reason)
    return jsonify(error=error), status
