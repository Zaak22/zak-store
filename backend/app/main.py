"""FastAPI entrypoint."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from .config import config
from .database import SessionLocal, describe_url, init_db
from .routers import admin, customer, public
from .seed import seed_if_empty

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("app")


# Postgres reports very different problems through one exception type with only
# a message to tell them apart, so a failed deploy shows a wall of traceback and
# no indication of which knob to turn. Match on the message and say so.
DB_HINTS: list[tuple[str, str]] = [
    (
        "password authentication failed",
        "The host resolved and TLS succeeded, so only the credentials are wrong.\n"
        "  · Compare the pwd_len and pwd=xx…yy above against your Neon connection string.\n"
        "  · Invisible characters are stripped automatically now; if none were reported\n"
        "    removed, the stored password genuinely differs from the one you expect.\n"
        "  · Re-copy it from Neon → Connection string (use Reset password if unsure),\n"
        "    and check you are on the right Neon branch — each has its own credentials.",
    ),
    (
        "network is unreachable",
        "Could not open a socket. Usually IPv6: the host publishes AAAA records that\n"
        "  this network cannot route. app/database.py pins connections to IPv4 — if you\n"
        "  are seeing this, that hook did not run. Check DATABASE_URL is a postgres URL.",
    ),
    (
        "could not translate host name",
        "DNS failed. The hostname in DATABASE_URL is misspelled or truncated.",
    ),
    (
        "timeout expired",
        "The server never answered. For Neon this usually means the compute is\n"
        "  suspended and slow to wake, or an IP/firewall restriction is in the way.",
    ),
    (
        "does not exist",
        "The database or role name is wrong — check the part after the last '/'.",
    ),
    (
        "certificate verify failed",
        "TLS verification failed. Neon needs ?sslmode=require (not verify-full unless\n"
        "  you have supplied a CA bundle).",
    ),
]


def _explain_db_failure(exc: Exception) -> None:
    """Turn an opaque connection error into a specific instruction."""
    message = str(exc).lower()
    hint = next((h for needle, h in DB_HINTS if needle in message), None)

    log.error("=" * 72)
    log.error("DATABASE CONNECTION FAILED — the app cannot start.")
    log.error("Tried: %s", describe_url())
    if hint:
        log.error("Most likely cause:\n  %s", hint)
    else:
        log.error("Unrecognised failure. Full error:\n  %s", str(exc)[:600])
    log.error("=" * 72)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Logged before connecting, so a failed connection still shows what we tried.
    log.info("DATABASE_URL → %s", describe_url())
    try:
        init_db()
    except Exception as exc:
        _explain_db_failure(exc)
        raise

    db = SessionLocal()
    try:
        seed_if_empty(db)
    finally:
        db.close()
    log.info("DB ready (%s) · push=%s", config.sqlalchemy_url.split("://")[0], config.push_enabled)
    yield


app = FastAPI(
    title=f"{config.app_name} API",
    version="1.0.0",
    description="Bilingual digital-goods storefront: catalogue, checkout, orders and web push.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_list,
    allow_credentials=False,  # we use bearer tokens, not cookies
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(public.router)
app.include_router(customer.router)
app.include_router(admin.auth_router)
app.include_router(admin.router)


@app.get("/health", tags=["meta"])
def health() -> dict:
    return {
        "status": "ok",
        "environment": config.environment,
        "push": config.push_enabled,
        "smtp": config.smtp_configured,
    }


# Serve the front-end from the same origin when it is present next to the backend.
# In production on Netlify the front-end is served separately and this is skipped.
_frontend = Path(__file__).resolve().parents[2] / "frontend"
if _frontend.is_dir():
    app.mount("/", StaticFiles(directory=str(_frontend), html=True), name="frontend")
else:
    @app.get("/", include_in_schema=False)
    def root():
        return RedirectResponse("/docs")
