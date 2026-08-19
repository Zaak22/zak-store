"""Engine / session wiring. Works with SQLite locally and Postgres in production."""
from __future__ import annotations

import datetime as dt
import decimal
import logging
from collections.abc import Iterator

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import Session, sessionmaker

from .config import config
from .models import Base

log = logging.getLogger("db")

_url = config.sqlalchemy_url
_connect_args = {"check_same_thread": False} if _url.startswith("sqlite") else {}

# Pool sizing matters more than it looks. Uvicorn's sync threadpool admits ~40
# concurrent requests, and a single checkout needs TWO connections: the request
# session, plus the background task's own session for the push notification.
# SQLAlchemy's default ceiling (pool_size=5 + max_overflow=10 = 15) is well
# under that, so a burst of orders exhausted the pool, blocked for the full
# 30s timeout, and returned 500 — losing orders whose customers had already
# paid. Size the pool above the server's real concurrency.
engine = create_engine(
    _url,
    connect_args=_connect_args,
    pool_pre_ping=True,
    pool_size=20,
    max_overflow=40,
    pool_timeout=10,        # fail fast rather than hanging a paying customer
    # Neon/serverless Postgres drops idle connections; recycle before it bites.
    pool_recycle=280,
)

if engine.dialect.name == "sqlite":
    @event.listens_for(engine, "connect")
    def _sqlite_fk_pragma(dbapi_connection, _record):
        """SQLite ignores foreign keys unless asked, per connection.

        Without this, every `ondelete` in the models is inert locally but live
        on the Postgres target — so deletes behave differently in dev and prod.
        """
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def _sql_default(column) -> str:
    """A literal DEFAULT for backfilling an added column on existing rows.

    Must be type-correct: an empty string for a NOT NULL timestamp is rejected
    outright by Postgres (InvalidDatetimeFormat) — aborting the deploy midway
    through a partial migration — and silently accepted by SQLite, which then
    fails on read with "Invalid isoformat string".
    """
    python_type = None
    try:
        python_type = column.type.python_type
    except NotImplementedError:
        pass

    is_sqlite = engine.dialect.name == "sqlite"
    default = getattr(column.default, "arg", None)

    # A callable default (e.g. `default=_now`) has no SQL form — fall through
    # to a type-appropriate literal below.
    if default is not None and not callable(default):
        if isinstance(default, bool):
            return ("1" if default else "0") if is_sqlite else str(default).lower()
        if isinstance(default, (int, float, decimal.Decimal)):
            return str(default)
        if isinstance(default, (dt.datetime, dt.date)):
            return f"'{default.isoformat()}'"
        return "'" + str(default).replace("'", "''") + "'"

    if python_type is bool:
        return "0" if is_sqlite else "false"
    if python_type in (int, float, decimal.Decimal):
        return "0"
    if python_type in (dt.datetime, dt.date, dt.time):
        # A literal, not CURRENT_TIMESTAMP: SQLite rejects non-constant
        # defaults in ADD COLUMN ("Cannot add a column with non-constant
        # default"), while a quoted ISO timestamp is valid on both engines.
        return "'" + dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat() + "'"
    return "''"


def ensure_schema() -> None:
    """Add columns that exist in the models but not yet in the database.

    `create_all` only creates missing *tables* — it never alters an existing
    one. Without this, adding a field to a model silently breaks every query
    against a database that was created before the change. Handles the additive
    case, which is all this project has needed; anything destructive still
    wants a real migration tool.
    """
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue
        have = {c["name"] for c in inspector.get_columns(table.name)}
        for column in table.columns:
            if column.name in have:
                continue
            col_type = column.type.compile(dialect=engine.dialect)
            clause = f'ALTER TABLE {table.name} ADD COLUMN {column.name} {col_type}'
            if not column.nullable:
                clause += f" NOT NULL DEFAULT {_sql_default(column)}"
            with engine.begin() as conn:
                conn.execute(text(clause))
            log.info("schema: added %s.%s", table.name, column.name)


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_schema()


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
