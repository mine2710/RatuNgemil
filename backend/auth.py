"""
Simple token-based authentication helper for POS API.
"""

import os
import secrets
from typing import Set
from fastapi import Header, HTTPException

DEFAULT_USERNAME = os.getenv("POS_USERNAME", "admin")
DEFAULT_PASSWORD = os.getenv("POS_PASSWORD", "admin123")

_active_tokens: Set[str] = set()


def login(username: str, password: str) -> str:
    """Validate credentials and return a temporary token."""
    if username != DEFAULT_USERNAME or password != DEFAULT_PASSWORD:
        raise HTTPException(status_code=401, detail="Username atau password salah")

    token = secrets.token_urlsafe(32)
    _active_tokens.add(token)
    return token


def require_auth(authorization: str = Header(default="")):
    """FastAPI dependency for protected endpoints."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token login tidak ditemukan")

    token = authorization.replace("Bearer ", "", 1).strip()
    if token not in _active_tokens:
        raise HTTPException(status_code=401, detail="Sesi login tidak valid, silakan login ulang")
