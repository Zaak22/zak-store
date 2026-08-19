"""Authentication for both the admin and storefront customers.

Two token scopes share one signing key. A token minted for one scope is
rejected by the other, so a customer token can never reach an admin route.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import os

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import config

_scheme = HTTPBearer(auto_error=False)

SCOPE_ADMIN = "admin"
SCOPE_CUSTOMER = "customer"

# scrypt parameters — stdlib only, no native build step to break a deploy.
_N, _R, _P, _DKLEN = 2 ** 14, 8, 1, 32


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=_DKLEN)
    return f"scrypt${salt.hex()}${dk.hex()}"


# Pre-computed hash of a value nobody can supply. Verifying against it makes an
# unknown-email login cost the same scrypt work as a wrong-password login, so
# response timing no longer reveals which addresses are registered.
_DUMMY_HASH: str | None = None


def dummy_verify(password: str) -> bool:
    """Burn the same CPU as a real check, always returning False."""
    global _DUMMY_HASH
    if _DUMMY_HASH is None:
        _DUMMY_HASH = hash_password("timing-equalisation-placeholder")
    verify_password(password, _DUMMY_HASH)
    return False


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, salt_hex, dk_hex = stored.split("$")
        if algo != "scrypt":
            return False
        dk = hashlib.scrypt(
            password.encode(), salt=bytes.fromhex(salt_hex), n=_N, r=_R, p=_P, dklen=_DKLEN
        )
        return hmac.compare_digest(dk.hex(), dk_hex)
    except (ValueError, TypeError):
        return False


def verify_admin_credentials(username: str, password: str) -> bool:
    """Constant-time comparison against the configured admin credentials.

    Compares UTF-8 bytes, not str: `hmac.compare_digest` raises TypeError on
    strings holding non-ASCII characters, which would turn an Arabic or
    accented password into a 500 instead of a clean 401.
    """
    # Both compared before combining, so the check does not short-circuit.
    user_ok = hmac.compare_digest(
        username.encode("utf-8"), config.admin_username.encode("utf-8")
    )
    pass_ok = hmac.compare_digest(
        password.encode("utf-8"), config.admin_password.encode("utf-8")
    )
    return user_ok and pass_ok


def create_token(subject: str, scope: str = SCOPE_ADMIN) -> str:
    now = dt.datetime.now(dt.timezone.utc)
    payload = {
        "sub": str(subject),
        "scope": scope,
        "iat": now,
        "exp": now + dt.timedelta(hours=config.token_ttl_hours),
    }
    return jwt.encode(payload, config.secret_key, algorithm="HS256")


def _decode(creds: HTTPAuthorizationCredentials | None, expected_scope: str) -> dict:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    try:
        payload = jwt.decode(
            creds.credentials,
            config.secret_key,
            algorithms=["HS256"],
            options={"require": ["exp", "sub", "scope"]},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")

    if payload.get("scope") != expected_scope:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Wrong token type for this endpoint")
    return payload


def require_admin(creds: HTTPAuthorizationCredentials | None = Depends(_scheme)) -> str:
    return str(_decode(creds, SCOPE_ADMIN).get("sub", ""))


def require_customer(creds: HTTPAuthorizationCredentials | None = Depends(_scheme)) -> int:
    sub = _decode(creds, SCOPE_CUSTOMER).get("sub", "")
    try:
        return int(sub)
    except (TypeError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token subject")


def optional_customer(creds: HTTPAuthorizationCredentials | None = Depends(_scheme)) -> int | None:
    """For checkout: link the order to an account when signed in, else guest."""
    if creds is None:
        return None
    try:
        return require_customer(creds)
    except HTTPException:
        return None
