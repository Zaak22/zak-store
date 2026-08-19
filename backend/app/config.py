"""Application configuration, loaded from environment variables / .env."""
from __future__ import annotations

import logging
import unicodedata
from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

log = logging.getLogger("config")

INSECURE_SECRETS = {"dev-secret-change-me", "change-me-to-a-long-random-string", ""}
INSECURE_PASSWORDS = {"admin123", "password", "admin", ""}


# Unicode categories that are invisible in a terminal or a form field:
# Cc control, Cf format (zero-width joiners, BOM, and the bidi marks LRM/RLM),
# Zs/Zl/Zp separators. None of these are legal unencoded in a URL.
_INVISIBLE_CATEGORIES = {"Cc", "Cf", "Zs", "Zl", "Zp"}


def _strip_invisible(value: str) -> str:
    """Remove every character that cannot be seen.

    `str.split()` is not enough. It keys off `str.isspace()`, which is True for
    U+00A0 NBSP but **False** for U+200B ZERO WIDTH SPACE and for the bidi
    marks U+200E LRM / U+200F RLM. Those three reach libpq intact, and SCRAM's
    SASLprep (RFC 4013) then either maps them to a literal space or refuses to
    normalise — either way authentication fails, with no warning and nothing
    visible on screen to explain it.

    The bidi marks matter here specifically: copying a Latin connection string
    out of a page that also contains Arabic very easily picks one up.
    """
    return "".join(
        ch for ch in value
        if not ch.isspace() and unicodedata.category(ch) not in _INVISIBLE_CATEGORIES
    )


class Config(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Zak Store"
    environment: str = "production"
    secret_key: str = "dev-secret-change-me"
    token_ttl_hours: int = 24

    admin_username: str = "admin"
    admin_password: str = "admin123"

    database_url: str = "sqlite:///./store.db"
    cors_origins: str = "*"

    # SMTP — credentials stay in env, never in the database (the settings table
    # is served to the dashboard over the API).
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_tls: bool = True

    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = "mailto:admin@example.com"

    # ------------------------------------------------------------------ misc
    @property
    def is_dev(self) -> bool:
        return self.environment.lower() in {"development", "dev", "local"}

    @model_validator(mode="after")
    def _refuse_insecure_production(self):
        """Fail closed.

        Every one of these was a live takeover path: an operator who forgot to
        set the env vars got a working `admin`/`admin123` login on a public URL,
        or a blank ADMIN_PASSWORD that accepted an empty password, or SQLite on
        an ephemeral disk that silently discarded every order on each redeploy.
        Refuse to boot instead of looking healthy.
        """
        problems: list[str] = []

        if self.secret_key.strip() in INSECURE_SECRETS:
            problems.append("SECRET_KEY is unset or still the example value")
        elif len(self.secret_key) < 32:
            problems.append("SECRET_KEY must be at least 32 characters")

        if not self.admin_username.strip():
            problems.append("ADMIN_USERNAME is empty")
        if self.admin_password.strip() in INSECURE_PASSWORDS:
            problems.append("ADMIN_PASSWORD is unset, empty, or a well-known default")

        if self.database_url.strip().startswith("sqlite"):
            problems.append(
                "DATABASE_URL points at SQLite — on Render/Fly the filesystem is "
                "ephemeral, so every order would be lost on redeploy. Use Postgres."
            )

        if not problems:
            return self

        if self.is_dev:
            for problem in problems:
                log.warning("insecure config (allowed in development): %s", problem)
            return self

        raise ValueError(
            "Refusing to start with an insecure production configuration:\n  - "
            + "\n  - ".join(problems)
            + "\n\nSet these environment variables, or set ENVIRONMENT=development "
              "if you are running locally."
        )

    # -------------------------------------------------------------- database
    @property
    def sqlalchemy_url(self) -> str:
        """Normalise the URL for psycopg3, repairing whitespace damage.

        Every way a pasted connection string can be corrupted — a trailing
        newline, a stray space, a hard line break landing inside the password —
        produces the identical server response: "password authentication
        failed". The hostname still resolves, so the error blames the password
        even when the real fault is a paste artifact, and the two are
        indistinguishable from the logs.

        Whitespace is never legal unencoded anywhere in a URL (a real space
        must be %20), so removing all of it is safe and repairs the whole class
        of corruption at once.

        Deliberately does NOT use urlsplit to detect the problem: urlsplit
        silently discards tab, CR and LF while parsing, so the parsed password
        looks clean while the raw string still carries the damage — which is
        exactly how the first attempt at this fix failed.
        """
        raw = self.database_url
        url = _strip_invisible(raw)

        if url != raw.strip():
            removed = len(raw.strip()) - len(url)
            log.warning(
                "DATABASE_URL contained %d invisible character(s); removed them. "
                "This is almost always a paste artifact, and would otherwise "
                "surface as 'password authentication failed'.",
                removed,
            )

        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+psycopg://", 1)
        elif url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+psycopg://", 1)
        return url

    # ----------------------------------------------------------------- other
    @property
    def cors_list(self) -> list[str]:
        raw = self.cors_origins.strip()
        if raw == "*":
            return ["*"]
        return [o.strip() for o in raw.split(",") if o.strip()]

    @property
    def smtp_configured(self) -> bool:
        return bool(self.smtp_host and self.smtp_user and self.smtp_password)

    @property
    def push_enabled(self) -> bool:
        return bool(self.vapid_public_key and self.vapid_private_key)


@lru_cache
def get_config() -> Config:
    return Config()


config = get_config()
