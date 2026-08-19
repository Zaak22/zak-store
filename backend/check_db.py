"""Test a Postgres connection string before pasting it into Render.

    ./.venv/bin/python check_db.py 'postgresql://user:pass@host/db?sslmode=require'

Reports whether it connects, and flags the most common cause of failure:
special characters in the password that must be percent-encoded, because the
URL parser otherwise splits the string in the wrong place.
"""
from __future__ import annotations

import sys
from urllib.parse import quote, unquote, urlsplit

# Characters that terminate or delimit parts of a URL. A raw one of these in a
# password silently truncates it (or moves the host boundary) before libpq ever
# sees it — which surfaces as "password authentication failed".
NEEDS_ENCODING = set("@/?#[]:%&= ")


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2

    raw = sys.argv[1].strip().strip('"').strip("'")
    parts = urlsplit(raw)

    print("Parsed connection string")
    print(f"  scheme:   {parts.scheme}")
    try:
        user, host, port = parts.username, parts.hostname, parts.port or 5432
    except ValueError:
        # An un-encoded ':' or '@' in the password moves every boundary, so the
        # parser reads part of the password as host and the rest as a port.
        print("  ❌ THE URL CANNOT BE PARSED")
        print()
        print("  Almost always an un-encoded character in the password:")
        print("  everything after a raw '@' is read as the hostname, and a raw")
        print("  ':' is read as the port separator.")
        print()
        print("  Easiest fix: in the Neon console, Reset password and copy the")
        print("  full connection string it shows — that one is already encoded.")
        return 1

    print(f"  user:     {user}")
    print(f"  host:     {host}")
    print(f"  port:     {port}")
    print(f"  database: {parts.path.lstrip('/')}")
    print(f"  query:    {parts.query or '(none)'}")

    if not user or not host:
        print()
        print("  ❌ user or host missing — the string is malformed.")
        print("     A raw '@' in the password is the usual cause.")
        print("     Reset the password in Neon and copy the whole string again.")
        return 1

    password = unquote(parts.password or "")
    print(f"  password: {len(password)} chars, "
          f"starts {password[:2]!r} ends {password[-2:]!r}" if password else "  password: MISSING")

    risky = sorted(NEEDS_ENCODING & set(password))
    if risky:
        print()
        print(f"  ⚠️  password contains {risky} — these MUST be percent-encoded.")
        print(f"      encoded password: {quote(password, safe='')}")
        print("      Rebuild the URL with that value in place of the raw password.")

    if "sslmode" not in (parts.query or ""):
        print()
        print("  ⚠️  no sslmode in the query string. Neon requires ?sslmode=require")

    print()
    print("Connecting…")
    try:
        import psycopg
    except ImportError:
        print("  psycopg not installed — run this inside the venv")
        return 2

    try:
        with psycopg.connect(raw, connect_timeout=15) as conn:
            with conn.cursor() as cur:
                cur.execute("select version(), current_user, current_database()")
                version, user, db = cur.fetchone()
        print("  ✅ CONNECTED")
        print(f"     user={user} database={db}")
        print(f"     {version.split(',')[0]}")
        print()
        print("  This string is good — paste it into Render as DATABASE_URL.")
        return 0
    except Exception as exc:
        print(f"  ❌ FAILED: {exc}")
        print()
        message = str(exc).lower()
        if "password authentication failed" in message:
            print("  The host and routing are fine; the password is wrong or mangled.")
            print("  In the Neon console: Dashboard → Connection string → Reset password,")
            print("  then copy the FULL string it shows you (it is already encoded).")
        elif "does not exist" in message:
            print("  The database or role name is wrong. Copy the string from Neon again.")
        elif "unreachable" in message or "timeout" in message:
            print("  Network path problem, not credentials.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
