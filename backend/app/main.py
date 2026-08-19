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


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Logged before connecting, so a failed connection still shows what we tried.
    log.info("DATABASE_URL → %s", describe_url())
    init_db()
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
